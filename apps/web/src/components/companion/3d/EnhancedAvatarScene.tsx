'use client';

import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import {
  AvatarConfig,
  CompanionVoiceState,
  VisemeCue,
} from '../AvatarRenderer';
import { Avatar3DConfig } from '@ai-companion/shared';
import { EnhancedAvatarModel } from './EnhancedAvatarModel';
import { EnhancedStudioEnvironment } from './EnhancedStudioEnvironment';
import {
  CAMERA_ZOOM_LIMITS,
  ModelBoundingMetrics,
  calculateDynamicLookAt,
  clampCameraDistance,
} from './animation-mappings';
import { useQualityConfig, QualityTier } from './quality';

export interface EnhancedAvatarSceneProps {
  modelUrl?: string;
  animationsUrl?: string;
  config?: AvatarConfig | Avatar3DConfig;
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
  qualityTier?: QualityTier;
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
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-300">
          Loading Enhanced 3D Companion
        </span>
        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-200"
            style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          />
        </div>
        <span className="text-[10px] text-emerald-400 font-mono mt-1.5">
          {Math.round(progress)}%
        </span>
      </div>
    </Html>
  );
}

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
    controlsRef.current.maxPolarAngle = Math.PI / 2 + 0.05;
    controlsRef.current.minPolarAngle = Math.PI / 8;
  }, [metrics]);

  useFrame(() => {
    if (!controlsRef.current) return;

    const currentDistance = camera.position.distanceTo(controlsRef.current.target);
    const clampedTarget = clampCameraDistance(targetDistance);

    const { targetY } = calculateDynamicLookAt(currentDistance, metrics);

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
      enableZoom={false}
      enableRotate={true}
      rotateSpeed={0.65}
      dampingFactor={0.08}
      enableDamping={!reducedMotion}
    />
  );
}

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

export const EnhancedAvatarScene: React.FC<EnhancedAvatarSceneProps> = ({
  modelUrl = '/models/aria_photorealistic.glb',
  animationsUrl = '/models/animations.glb',
  config,
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
  qualityTier,
}) => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [metrics, setMetrics] = useState<ModelBoundingMetrics | null>(null);

  const qualityConfig = useQualityConfig(qualityTier, { enableAutoDetect: true });
  const dpr = useMemo(() => qualityConfig.dpr, [qualityConfig.dpr]);
  const rendererGL = useMemo(() => ({
    antialias: qualityConfig.antialias,
    alpha: false,
    powerPreference: 'high-performance' as const,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
  }), [qualityConfig.antialias]);

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
        dpr={dpr}
        gl={rendererGL}
        className="w-full h-full bg-[#0a0f1a]"
      >
        <color attach="background" args={['#0a0f1a']} />

        {/* Enhanced Studio Environment with IBL */}
        <Suspense fallback={<CanvasLoader />}>
          <EnhancedStudioEnvironment
            reducedMotion={reducedMotion}
            qualityConfig={qualityConfig}
          />
        </Suspense>

        {/* Enhanced 3D Humanoid Character */}
        <Suspense fallback={<CanvasLoader />}>
          <EnhancedAvatarModel
            modelUrl={modelUrl}
            animationsUrl={animationsUrl}
            config={config}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            visemes={visemes}
            currentTime={currentTime}
            reducedMotion={reducedMotion}
            onMetricsLoaded={handleMetricsLoaded}
            onTapReaction={onTapReaction}
            qualityConfig={qualityConfig}
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

// Preload models
import { useGLTF } from '@react-three/drei';
useGLTF.preload('/models/aria_photorealistic.glb');
useGLTF.preload('/models/animations.glb');