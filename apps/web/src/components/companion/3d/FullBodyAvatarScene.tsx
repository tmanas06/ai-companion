'use client';

import React, { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import {
  CompanionVoiceState,
  VisemeCue,
} from '../AvatarRenderer';
import { FullBodyAvatarModel } from './FullBodyAvatarModel';
import { StudioEnvironment } from './StudioEnvironment';
import {
  CAMERA_ZOOM_LIMITS,
  ModelBoundingMetrics,
  calculateDynamicLookAt,
  clampCameraDistance,
} from './animation-mappings';

export interface FullBodyAvatarSceneProps {
  modelUrl?: string;
  animationsUrl?: string;
  state?: CompanionVoiceState;
  audioLevel?: number;
  isSpeaking?: boolean;
  visemes?: VisemeCue[];
  currentTime?: number;
  zoomDistance?: number;
  onFpsUpdate?: (fps: number) => void;
  onMetricsLoaded?: (metrics: ModelBoundingMetrics) => void;
  onTapReaction?: (reactionType: 'head' | 'body') => void;
  className?: string;
}

interface OrbitControlsRigRef {
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  minPolarAngle: number;
  update: () => void;
}

function CanvasLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl text-white min-w-[170px] pointer-events-none select-none">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-300">
          Loading 3D Companion
        </span>
        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
          <div
            className="bg-violet-500 h-full rounded-full transition-all duration-200"
            style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          />
        </div>
        <span className="text-[10px] text-violet-400 font-mono mt-1.5">
          {Math.round(progress)}%
        </span>
      </div>
    </Html>
  );
}

/**
 * Camera Controller managing smooth zoom, limits, and dynamic anatomical look-at framing.
 * When zooming in close, the look-at point rises to the face.
 * When zooming out wide, the look-at point centers on the full body.
 */
function CameraRig({
  targetDistance,
  metrics,
  reducedMotion,
}: {
  targetDistance: number;
  metrics: ModelBoundingMetrics | null;
  reducedMotion: boolean;
}) {
  const controlsRef = useRef<OrbitControlsRigRef>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!controlsRef.current) return;
    const initialTargetY = metrics ? metrics.center[1] : CAMERA_ZOOM_LIMITS.DEFAULT_TARGET_Y;
    controlsRef.current.target.set(0, initialTargetY, 0);
    controlsRef.current.minDistance = CAMERA_ZOOM_LIMITS.MIN_DISTANCE;
    controlsRef.current.maxDistance = CAMERA_ZOOM_LIMITS.MAX_DISTANCE;
    // Limit vertical orbit so user cannot look below the floor or flip inverted
    controlsRef.current.maxPolarAngle = Math.PI / 2 + 0.05;
    controlsRef.current.minPolarAngle = Math.PI / 8;
  }, [metrics]);

  useFrame(() => {
    if (!controlsRef.current) return;

    // Calculate current distance from target
    const currentDistance = camera.position.distanceTo(controlsRef.current.target);
    const clampedTarget = clampCameraDistance(targetDistance);

    // Compute dynamic look-at point: as camera gets closer to face, target moves up towards head
    const { targetY } = calculateDynamicLookAt(currentDistance, metrics);

    // Smoothly interpolate target Y
    if (Math.abs(controlsRef.current.target.y - targetY) > 0.005) {
      controlsRef.current.target.y = THREE.MathUtils.lerp(
        controlsRef.current.target.y,
        targetY,
        reducedMotion ? 1.0 : 0.08
      );
    }

    if (Math.abs(currentDistance - clampedTarget) > 0.01) {
      const direction = camera.position.clone().sub(controlsRef.current.target).normalize();
      const nextDist = reducedMotion
        ? clampedTarget
        : THREE.MathUtils.lerp(currentDistance, clampedTarget, 0.08);

      camera.position.copy(
        controlsRef.current.target.clone().add(direction.multiplyScalar(nextDist))
      );
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef as unknown as React.Ref<never>}
      enablePan={false}
      enableZoom={false} // Zoom is handled via our camera toolbar & rig
      enableRotate={true}
      rotateSpeed={0.65}
      dampingFactor={0.08}
      enableDamping={!reducedMotion}
    />
  );
}

/**
 * Lightweight real-time FPS and performance monitor.
 */
function PerformanceMonitor({ onFpsUpdate }: { onFpsUpdate?: (fps: number) => void }) {
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useFrame(() => {
    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    if (elapsed >= 1000) {
      const calculatedFps = Math.round((frameCountRef.current * 1000) / elapsed);
      onFpsUpdate?.(calculatedFps);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }
  });

  return null;
}

export const FullBodyAvatarScene: React.FC<FullBodyAvatarSceneProps> = ({
  modelUrl = '/models/aria_photorealistic.glb',
  animationsUrl = '/models/animations.glb',
  state = 'idle',
  audioLevel = 0,
  isSpeaking = false,
  visemes,
  currentTime,
  zoomDistance = CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE,
  onFpsUpdate,
  onMetricsLoaded,
  onTapReaction,
  className = '',
}) => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [metrics, setMetrics] = useState<ModelBoundingMetrics | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    try {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(query.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    } catch {
      // Ignored
    }
  }, []);

  const handleMetricsLoaded = useCallback(
    (newMetrics: ModelBoundingMetrics) => {
      setMetrics(newMetrics);
      onMetricsLoaded?.(newMetrics);
    },
    [onMetricsLoaded]
  );

  return (
    <div className={`relative w-full h-full select-none ${className}`}>
      <Canvas
        camera={{
          position: [0, CAMERA_ZOOM_LIMITS.DEFAULT_CAMERA_Y, CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE],
          fov: CAMERA_ZOOM_LIMITS.DEFAULT_FOV,
        }}
        dpr={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.02,
        }}
        className="w-full h-full bg-[#1e222e]"
      >
        <color attach="background" args={['#1e222e']} />

        {/* Believable Contemporary Softly Lit Studio Room Environment */}
        <StudioEnvironment reducedMotion={reducedMotion} />

        {/* 3D Humanoid Character */}
        <Suspense fallback={<CanvasLoader />}>
          <FullBodyAvatarModel
            modelUrl={modelUrl}
            animationsUrl={animationsUrl}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            visemes={visemes}
            currentTime={currentTime}
            reducedMotion={reducedMotion}
            onMetricsLoaded={handleMetricsLoaded}
            onTapReaction={onTapReaction}
          />
        </Suspense>

        {/* Dynamic Anatomical Camera Rig */}
        <CameraRig
          targetDistance={zoomDistance}
          metrics={metrics}
          reducedMotion={reducedMotion}
        />

        {/* Performance tracking */}
        <PerformanceMonitor onFpsUpdate={onFpsUpdate} />
      </Canvas>
    </div>
  );
};
