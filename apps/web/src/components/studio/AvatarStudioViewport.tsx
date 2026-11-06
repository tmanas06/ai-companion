'use client';

import React, { useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import { Avatar3DConfig } from '@ai-companion/shared';
import { AvatarStudioModel } from './AvatarStudioModel';
import { StudioEnvironment } from '../companion/3d/StudioEnvironment';

export type CameraPreset = 'face' | 'torso' | 'full';

interface OrbitControlsInstance {
  target: { set: (x: number, y: number, z: number) => void };
  update: () => void;
}

interface CameraRigProps {
  preset: CameraPreset;
}

function CameraRig({ preset }: CameraRigProps) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsInstance | null>(null);

  useEffect(() => {
    if (!controlsRef.current) return;

    if (preset === 'face') {
      camera.position.set(0, 1.52, 1.15);
      controlsRef.current.target.set(0, 1.48, 0);
    } else if (preset === 'torso') {
      camera.position.set(0, 1.25, 1.95);
      controlsRef.current.target.set(0, 1.1, 0);
    } else {
      camera.position.set(0, 0.95, 3.2);
      controlsRef.current.target.set(0, 0.85, 0);
    }
    controlsRef.current.update();
  }, [preset, camera]);

  return (
    <OrbitControls
      ref={controlsRef as unknown as React.Ref<never>}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={0.6}
      maxDistance={4.5}
      maxPolarAngle={Math.PI / 2 + 0.05}
      minPolarAngle={Math.PI / 8}
    />
  );
}

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl text-white min-w-[160px] pointer-events-none select-none">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-300">
          Loading 3D Studio
        </span>
        <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className="bg-violet-500 h-full rounded-full transition-all duration-150"
            style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          />
        </div>
        <span className="text-[9px] text-violet-400 font-mono mt-1">
          {Math.round(progress)}%
        </span>
      </div>
    </Html>
  );
}

interface AvatarStudioViewportProps {
  config: Avatar3DConfig;
  cameraPreset: CameraPreset;
  onCameraPresetChange: (preset: CameraPreset) => void;
  isTestSpeaking: boolean;
}

export const AvatarStudioViewport: React.FC<AvatarStudioViewportProps> = ({
  config,
  cameraPreset,
  onCameraPresetChange,
  isTestSpeaking,
}) => {
  return (
    <div className="relative w-full h-full min-h-[420px] bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* 3D WebGL Canvas */}
      <Canvas
        shadows={false}
        camera={{ position: [0, 1.52, 1.15], fov: 32 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <Suspense fallback={<Loader />}>
          <StudioEnvironment />
          <AvatarStudioModel config={config} isTestSpeaking={isTestSpeaking} />
          <CameraRig preset={cameraPreset} />
        </Suspense>
      </Canvas>

      {/* Floating Camera Framing Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-xl p-1 shadow-lg gap-1">
        <button
          onClick={() => onCameraPresetChange('face')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            cameraPreset === 'face'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Face
        </button>
        <button
          onClick={() => onCameraPresetChange('torso')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            cameraPreset === 'torso'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Half-Body
        </button>
        <button
          onClick={() => onCameraPresetChange('full')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            cameraPreset === 'full'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Full-Body
        </button>
      </div>

      {/* Viewport Control Instructions */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none select-none text-[11px] text-slate-400 bg-slate-900/60 backdrop-blur-sm px-3 py-1 rounded-lg border border-slate-800">
        Left Click: Orbit • Right Click: Pan • Scroll: Zoom
      </div>
    </div>
  );
};
