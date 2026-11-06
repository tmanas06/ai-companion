'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  AvatarRenderer,
  AvatarRendererProps,
} from './AvatarRenderer';
import { CameraToolbar, AvatarDisplayMode } from './3d/CameraToolbar';
import {
  CAMERA_ZOOM_LIMITS,
  CameraFramingPreset,
  ModelBoundingMetrics,
  deriveFramingFromMetrics,
  clampCameraDistance,
} from './3d/animation-mappings';
import { VideoAvatarRenderer } from './video/VideoAvatarRenderer';
import { AvatarEmotion } from '@/lib/avatar-video-manifest';
import { inferCompanionGender } from '@/lib/companion-presets';

// Dynamically lazy-load the Three.js Canvas scene without SSR
const Dynamic3DScene = dynamic(
  () => import('./3d/FullBodyAvatarScene').then((mod) => mod.FullBodyAvatarScene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-3 text-slate-400 animate-pulse">
        <div className="w-12 h-12 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
        <span className="text-xs font-medium tracking-wider">Preparing 3D Companion...</span>
      </div>
    ),
  }
);

/**
 * Checks if the client environment supports WebGL.
 */
function isWebGLSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2'))
    );
  } catch {
    return false;
  }
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ThreeErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[FullBodyAvatar] 3D Scene error caught, reverting to 2.5D:', error, info);
    this.props.onError?.(error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export interface FullBodyAvatarProps extends AvatarRendererProps {
  modelUrl?: string;
  animationsUrl?: string;
  showControls?: boolean;
  defaultTo3D?: boolean;
  initialMode?: AvatarDisplayMode;
  currentEmotion?: AvatarEmotion;
  emotionIntensity?: number;
}

const ARIA_PHOTOREALISTIC_MODEL = '/models/aria_photorealistic.glb';
const MARCUS_PHOTOREALISTIC_MODEL = '/models/marcus_photorealistic.glb';
const DEFAULT_LEGACY_MODEL = '/models/avatar.glb';

export const FullBodyAvatar: React.FC<FullBodyAvatarProps> = ({
  modelUrl: explicitModelUrl,
  animationsUrl = '/models/animations.glb',
  state = 'idle',
  audioLevel = 0,
  isSpeaking = false,
  visemes,
  currentTime,
  previewUrl,
  name = 'Companion',
  showControls = true,
  defaultTo3D = true,
  initialMode,
  currentEmotion = 'neutral',
  emotionIntensity = 0.5,
  className = '',
  ...props
}) => {
  const [hasWebGL, setHasWebGL] = useState<boolean>(() => isWebGLSupported());

  // Determine companion identity: Aria defaults to photorealistic video avatar!
  const isAria = name.toLowerCase().includes('aria');
  const [displayMode, setDisplayMode] = useState<AvatarDisplayMode>(() => {
    if (initialMode) return initialMode;
    if (!isWebGLSupported()) return '2d';
    return isAria ? 'video' : defaultTo3D ? '3d' : '2d';
  });

  // Determine appropriate 3D character model
  const isMaleCharacter = inferCompanionGender({ name, personality: null }) === 'male';
  const targetCharacterModel = isMaleCharacter
    ? MARCUS_PHOTOREALISTIC_MODEL
    : ARIA_PHOTOREALISTIC_MODEL;

  const [resolvedModelUrl, setResolvedModelUrl] = useState<string>(
    () => explicitModelUrl || targetCharacterModel
  );
  const [zoomDistance, setZoomDistance] = useState<number>(
    CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE
  );
  const [activePreset, setActivePreset] = useState<CameraFramingPreset>('full');
  const [metrics, setMetrics] = useState<ModelBoundingMetrics | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [reactionFeedback, setReactionFeedback] = useState<string | null>(null);

  // Sync display mode when companion identity resolves or changes
  useEffect(() => {
    if (initialMode) {
      setDisplayMode(initialMode);
    } else if (name.toLowerCase().includes('aria')) {
      setDisplayMode('video');
    } else {
      setDisplayMode(defaultTo3D ? '3d' : '2d');
    }
  }, [name, initialMode, defaultTo3D]);

  // Check WebGL availability and probe for target photorealistic asset
  useEffect(() => {
    const supported = isWebGLSupported();
    setHasWebGL(supported);
    if (!supported && displayMode === '3d') {
      setDisplayMode('2d');
    }

    if (explicitModelUrl) {
      setResolvedModelUrl(explicitModelUrl);
      return;
    }

    const currentTarget = targetCharacterModel;

    // Check availability of target photorealistic asset; fallback to default if missing
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      let isMounted = true;
      fetch(currentTarget, { method: 'HEAD' })
        .then((res) => {
          if (!isMounted) return;
          if (res.ok) {
            setResolvedModelUrl(currentTarget);
          } else {
            console.warn(`[FullBodyAvatar] Target model ${currentTarget} not found (HTTP ${res.status}), using fallback`);
            setResolvedModelUrl(DEFAULT_LEGACY_MODEL);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setResolvedModelUrl(DEFAULT_LEGACY_MODEL);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setResolvedModelUrl(currentTarget);
    }
  }, [explicitModelUrl, targetCharacterModel, displayMode]);

  // Preset framing selection handler (Face close-up, Bust upper-body, Full head-to-toe)
  const handleSelectPreset = useCallback(
    (preset: CameraFramingPreset) => {
      setActivePreset(preset);
      const framing = deriveFramingFromMetrics(metrics, preset);
      setZoomDistance(framing.distance);
    },
    [metrics]
  );

  // Camera toolbar controls
  const handleZoomIn = useCallback(() => {
    setZoomDistance((prev) => {
      const next = clampCameraDistance(prev - CAMERA_ZOOM_LIMITS.ZOOM_STEP);
      if (next <= 1.05) setActivePreset('face');
      else if (next <= 1.85) setActivePreset('upper');
      else setActivePreset('full');
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomDistance((prev) => {
      const next = clampCameraDistance(prev + CAMERA_ZOOM_LIMITS.ZOOM_STEP);
      if (next <= 1.05) setActivePreset('face');
      else if (next <= 1.85) setActivePreset('upper');
      else setActivePreset('full');
      return next;
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    setActivePreset('full');
    const framing = deriveFramingFromMetrics(metrics, 'full');
    setZoomDistance(framing.distance);
  }, [metrics]);

  const handleToggle3D = useCallback(() => {
    setDisplayMode((prev) => (prev === '3d' ? '2d' : '3d'));
  }, []);

  const handleVideoError = useCallback((err: Error) => {
    console.warn('[FullBodyAvatar] Video playback failed, transitioning to 3D/2D fallback:', err);
    setDisplayMode(hasWebGL ? '3d' : '2d');
  }, [hasWebGL]);

  const handleTapReaction = useCallback((reactionType: 'head' | 'body') => {
    if (reactionType === 'head') {
      setReactionFeedback('😊 Giggles!');
    } else {
      setReactionFeedback('👋 Hello there!');
    }
    setTimeout(() => {
      setReactionFeedback(null);
    }, 2400);
  }, []);

  return (
    <div
      data-testid="full-body-avatar-root"
      className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden ${className}`}
    >
      {/* 1. Photorealistic Video Avatar (Primary Experience for Aria) */}
      {displayMode === 'video' ? (
        <div className="relative w-full h-full flex items-center justify-center animate-in fade-in duration-300">
          <VideoAvatarRenderer
            state={state}
            currentEmotion={currentEmotion}
            emotionIntensity={emotionIntensity}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            onError={handleVideoError}
          />
        </div>
      ) : displayMode === '3d' && hasWebGL ? (
        /* 2. Full-Body 3D Canvas Stage (Secondary / Fallback View) */
        <div className="relative w-full h-full flex items-center justify-center animate-in fade-in duration-300">
          <ThreeErrorBoundary
            onError={() => setDisplayMode('2d')}
            fallback={
              <div className="relative flex flex-col items-center justify-center p-6">
                <AvatarRenderer
                  previewUrl={previewUrl}
                  name={name}
                  state={state}
                  audioLevel={audioLevel}
                  isSpeaking={isSpeaking}
                  visemes={visemes}
                  currentTime={currentTime}
                  size={320}
                  {...props}
                />
              </div>
            }
          >
            <Dynamic3DScene
              modelUrl={resolvedModelUrl}
              animationsUrl={animationsUrl}
              state={state}
              audioLevel={audioLevel}
              isSpeaking={isSpeaking}
              visemes={visemes}
              currentTime={currentTime}
              zoomDistance={zoomDistance}
              onFpsUpdate={setFps}
              onMetricsLoaded={setMetrics}
              onTapReaction={handleTapReaction}
            />
          </ThreeErrorBoundary>

          {/* Interaction feedback overlay */}
          {reactionFeedback && (
            <div className="absolute top-8 px-4 py-2 rounded-2xl bg-violet-600/90 text-white text-xs font-semibold shadow-lg shadow-violet-500/30 animate-bounce pointer-events-none z-30">
              {reactionFeedback}
            </div>
          )}

          {/* Measured FPS indicator */}
          {fps !== null && (
            <div
              className="absolute bottom-3 left-4 text-[10px] font-mono text-slate-500/80 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-900 pointer-events-none select-none z-20"
              title="Measured rendering frame rate"
            >
              {fps} FPS
            </div>
          )}
        </div>
      ) : (
        /* 3. Fallback 2.5D Landmark Avatar Portrait */
        <div className="relative flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <AvatarRenderer
            previewUrl={previewUrl}
            name={name}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            visemes={visemes}
            currentTime={currentTime}
            size={320}
            {...props}
          />
          {!hasWebGL && displayMode === '3d' && (
            <span className="mt-3 text-[11px] text-amber-400/90">
              WebGL unavailable on device — using 2.5D portrait view
            </span>
          )}
        </div>
      )}

      {/* Camera & Avatar Presentation Toolbar */}
      {showControls && (
        <div className="absolute bottom-3 right-4 z-30">
          <CameraToolbar
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onReset={handleResetCamera}
            onSelectPreset={handleSelectPreset}
            activePreset={activePreset}
            displayMode={displayMode}
            onChangeDisplayMode={setDisplayMode}
            hasVideoMode={isAria}
            is3DMode={displayMode === '3d'}
            onToggle3DMode={handleToggle3D}
          />
        </div>
      )}
    </div>
  );
};
