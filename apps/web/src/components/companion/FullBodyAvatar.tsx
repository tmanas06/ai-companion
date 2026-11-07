'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AvatarRenderer,
  AvatarRendererProps,
  AvatarExpression,
  CompanionVoiceState,
} from './AvatarRenderer';
import { CameraToolbar, AvatarDisplayMode, AvatarRenderMode } from './3d/CameraToolbar';
import { EnhancedAvatarScene } from './3d/EnhancedAvatarScene';

export type { AvatarDisplayMode } from './3d/CameraToolbar';
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
import { Avatar3DConfig } from '@ai-companion/shared';

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

export interface FullBodyAvatarProps extends AvatarRendererProps {
  modelUrl?: string;
  animationsUrl?: string;
  showControls?: boolean;
  defaultTo3D?: boolean;
  initialMode?: AvatarDisplayMode;
  initialRenderMode?: AvatarRenderMode;
  onChangeDisplayMode?: (mode: AvatarDisplayMode) => void;
  onChangeRenderMode?: (mode: AvatarRenderMode) => void;
  onMetricsLoaded?: (metrics: ModelBoundingMetrics) => void;
  currentEmotion?: AvatarEmotion;
  emotionIntensity?: number;
  sadtalkerVideoUrl?: string | null;
}

const ARIA_PHOTOREALISTIC_MODEL = '/models/aria_photorealistic.glb';
const MARCUS_PHOTOREALISTIC_MODEL = '/models/marcus_photorealistic.glb';
const DEFAULT_LEGACY_MODEL = '/models/avatar.glb';

/**
 * Maps companion application state and backend emotion deterministically to a 2D avatar expression.
 * Explicitly avoids unsupported sentiment assumptions.
 */
export function deriveDeterministicExpression(
  state: CompanionVoiceState = 'idle',
  currentEmotion: AvatarEmotion = 'neutral',
  explicitExpression?: AvatarExpression
): AvatarExpression {
  if (explicitExpression) return explicitExpression;

  if (state === 'error') {
    return 'concerned';
  }

  if (state === 'processing_speech' || state === 'generating_response') {
    return 'thoughtful';
  }

  if (state === 'speaking') {
    if (currentEmotion === 'happy' || currentEmotion === 'laughing') {
      return 'happy';
    }
    if (currentEmotion === 'sad' || currentEmotion === 'confused') {
      return 'concerned';
    }
  }

  return 'neutral';
}

export const FullBodyAvatar: React.FC<FullBodyAvatarProps> = ({
  modelUrl: explicitModelUrl,
  animationsUrl = '/models/animations.glb',
  config,
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
  initialRenderMode,
  onChangeDisplayMode,
  onChangeRenderMode,
  onMetricsLoaded,
  currentEmotion = 'neutral',
  emotionIntensity = 0.5,
  sadtalkerVideoUrl,
  expression: explicitExpression,
  className = '',
  ...props
}) => {
  const [hasWebGL, setHasWebGL] = useState<boolean>(() => isWebGLSupported());

  const effectiveExpression = deriveDeterministicExpression(
    state,
    currentEmotion,
    explicitExpression
  );

  // Check if active 3D customization exists
  const config3D = config && (config as Avatar3DConfig).version === 2 ? (config as Avatar3DConfig) : null;

  // Determine appropriate 3D character model based on config.baseModelId or fallback to character inference
  const isMaleCharacter = inferCompanionGender({ name, personality: null }) === 'male';
  const isMarcus = name.toLowerCase().includes('marcus') || isMaleCharacter;
  const isMarcusModel =
    config3D?.baseModelId === 'marcus_photorealistic' ||
    config3D?.baseModelId === 'human_male_v1' ||
    (isMarcus && (!config3D || config3D.baseModelId !== 'aria_photorealistic'));
  const targetCharacterModel = isMarcusModel
    ? MARCUS_PHOTOREALISTIC_MODEL
    : ARIA_PHOTOREALISTIC_MODEL;

  // Determine companion identity: Aria defaults to photorealistic video avatar when no 3D studio config is set
  const isAria = name.toLowerCase().includes('aria');
  const [displayMode, setDisplayMode] = useState<AvatarDisplayMode>(() => {
    if (initialMode) return initialMode;
    if (!isWebGLSupported()) return 'photorealistic-2d';
    // If user saved a customized 3D avatar from Avatar Studio, showcase their 3D companion
    if (config3D) return '3d';
    return isAria ? 'video' : defaultTo3D ? '3d' : 'photorealistic-2d';
  });

  const [resolvedModelUrl, setResolvedModelUrl] = useState<string>(
    () => explicitModelUrl || targetCharacterModel
  );
  const [zoomDistance, setZoomDistance] = useState<number>(
    CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE
  );
  const [activePreset, setActivePreset] = useState<CameraFramingPreset>('full');
  const [metrics, setMetrics] = useState<ModelBoundingMetrics | null>(null);
  const [renderMode, setRenderMode] = useState<AvatarRenderMode>(() => {
    if (initialRenderMode) return initialRenderMode;
    return 'baseline';
  });

  // Wrapper to update display mode and notify parent
  const updateDisplayMode = useCallback((mode: AvatarDisplayMode | ((prev: AvatarDisplayMode) => AvatarDisplayMode)) => {
    setDisplayMode(mode);
    if (typeof mode === 'function') {
      // Call onChangeDisplayMode with the new value after state updates
      // We need to wait for the state update, so we'll use a ref or just call with the computed value
      setDisplayMode((prev) => {
        const newMode = mode(prev);
        onChangeDisplayMode?.(newMode);
        return newMode;
      });
    } else {
      onChangeDisplayMode?.(mode);
    }
  }, [onChangeDisplayMode]);

  // Sync display mode when companion identity or active 3D avatar configuration changes
  useEffect(() => {
    if (initialMode) {
      updateDisplayMode(initialMode);
    } else if (config3D) {
      // Prioritize the customized 3D avatar when WebGL is available
      updateDisplayMode(isWebGLSupported() ? '3d' : 'photorealistic-2d');
    } else if (name.toLowerCase().includes('aria')) {
      updateDisplayMode('video');
    } else {
      updateDisplayMode(defaultTo3D ? '3d' : 'photorealistic-2d');
    }
  }, [name, initialMode, defaultTo3D, config3D, updateDisplayMode]);

  // Sync render mode
  useEffect(() => {
    if (initialRenderMode) {
      setRenderMode(initialRenderMode);
      onChangeRenderMode?.(initialRenderMode);
    }
  }, [initialRenderMode, onChangeRenderMode]);

  const updateRenderMode = useCallback((mode: AvatarRenderMode) => {
    setRenderMode(mode);
    onChangeRenderMode?.(mode);
  }, [onChangeRenderMode]);

  const handleMetricsLoaded = useCallback(
    (newMetrics: ModelBoundingMetrics) => {
      setMetrics(newMetrics);
      onMetricsLoaded?.(newMetrics);
    },
    [onMetricsLoaded]
  );

  // Check WebGL availability and probe for target photorealistic asset
  useEffect(() => {
    const supported = isWebGLSupported();
    setHasWebGL(supported);
    // Note: 3D Body tab now uses a CSS/image cinematic stage that does NOT require WebGL,
    // so we no longer automatically downgrade 3d → photorealistic-2d when WebGL is absent.

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
  }, [explicitModelUrl, targetCharacterModel, displayMode, updateDisplayMode]);

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
    updateDisplayMode((prev: AvatarDisplayMode) => (prev === '3d' ? 'photorealistic-2d' : '3d'));
  }, [updateDisplayMode]);

  const handleVideoError = useCallback((err: Error) => {
    console.warn('[FullBodyAvatar] Video playback failed, transitioning to 3D/2D fallback:', err);
    updateDisplayMode(hasWebGL ? '3d' : 'photorealistic-2d');
  }, [hasWebGL, updateDisplayMode]);

  const handleTapReaction = useCallback((reactionType: 'head' | 'body') => {
    if (reactionType === 'head') {
    } else {
    }
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
            sadtalkerVideoUrl={sadtalkerVideoUrl}
            onError={handleVideoError}
          />
        </div>
      ) : displayMode === '3d' && renderMode === 'enhanced' ? (
        /* Enhanced 3D Renderer (Experimental) */
        <EnhancedAvatarScene
          modelUrl={resolvedModelUrl}
          animationsUrl={animationsUrl}
          config={config}
          state={state}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          visemes={visemes}
          currentTime={currentTime}
          zoomDistance={zoomDistance}
          onMetricsLoaded={handleMetricsLoaded}
          onTapReaction={handleTapReaction}
          className="w-full h-full"
        />
      ) : displayMode === '3d' ? (
        /* 2. Full-Body Cinematic Stage (3D Body tab — transparent full body merged with room background) */
        <div
          data-testid="photorealistic-2d-stage"
          className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-300"
        >
          <AvatarRenderer
            previewUrl={previewUrl}
            name={name}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            visemes={visemes}
            currentTime={currentTime}
            expression={effectiveExpression}
            framing={activePreset}
            stageMode={true}
            className="w-full h-full"
            {...props}
          />
        </div>
      ) : (
        /* 3. Photorealistic 2D Face-Only Portrait Card (Photo 2D tab — original compact card) */
        <div
          data-testid="photorealistic-2d-portrait"
          className="relative w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-300"
        >
          <AvatarRenderer
            previewUrl={previewUrl}
            name={name}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={isSpeaking}
            visemes={visemes}
            currentTime={currentTime}
            expression={effectiveExpression}
            stageMode={false}
            size={320}
            className=""
            {...props}
          />
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
            renderMode={renderMode}
            onChangeRenderMode={updateRenderMode}
            hasVideoMode={isAria}
            is3DMode={displayMode === '3d'}
            onToggle3DMode={handleToggle3D}
            showFramingControls={displayMode === '3d'}
          />
        </div>
      )}
    </div>
  );
};
