/**
 * MobileAvatarRenderer Component.
 * Integrates Expo GL, Three.js, and ThreeSceneManager to render
 * customizable 3D GLB avatars on mobile with morph targets and speech animation.
 * Includes automatic error boundary and graceful 2D fallback.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import {
  Avatar3DConfig,
  DEFAULT_AVATAR_3D_CONFIG,
  SupportedBaseModelId,
} from '@ai-companion/shared';
import { ThreeSceneManager, CameraPreset, WordAlignment } from './ThreeSceneManager';
import { Avatar2DFallback } from './Avatar2DFallback';
import { getApiBaseUrl } from '../../services/api-client';
import { getCachedModelUri } from '../../services/model-cache-manager';

export interface MobileAvatarRendererProps {
  config: Avatar3DConfig;
  cameraPreset?: CameraPreset;
  isSpeaking?: boolean;
  isListening?: boolean;
  audioLevel?: number;
  wordAlignment?: WordAlignment | null;
  testID?: string;
  force2D?: boolean;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
}

export function MobileAvatarRenderer({
  config = DEFAULT_AVATAR_3D_CONFIG,
  cameraPreset = 'face',
  isSpeaking = false,
  isListening = false,
  audioLevel = 0,
  wordAlignment = null,
  testID = 'mobile-avatar-renderer',
  force2D = false,
  onLoaded,
  onError,
}: MobileAvatarRendererProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentModelId, setCurrentModelId] = useState<SupportedBaseModelId>(
    config.baseModelId || 'aria_photorealistic'
  );

  const sceneManagerRef = useRef<ThreeSceneManager | null>(null);
  const glContextRef = useRef<ExpoWebGLRenderingContext | null>(null);

  // Model file resolution (prefer mobile optimized variant with 1024x1024 WebP textures)
  const getModelUrl = useCallback((baseModelId: SupportedBaseModelId) => {
    const isMarcus =
      baseModelId === 'marcus_photorealistic' || baseModelId === 'human_male_v1';
    const filename = isMarcus
      ? 'marcus_photorealistic_mobile.glb'
      : 'aria_photorealistic_mobile.glb';
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}/models/${filename}`;
  }, []);

  // Update scene manager config when config prop changes
  useEffect(() => {
    if (!sceneManagerRef.current) return;

    if (config.baseModelId && config.baseModelId !== currentModelId) {
      // Base model changed (Aria <-> Marcus): reload model
      setCurrentModelId(config.baseModelId);
      setLoading(true);
      const remoteUrl = getModelUrl(config.baseModelId);
      getCachedModelUri(remoteUrl, config.baseModelId)
        .then((cacheRes) => sceneManagerRef.current?.loadModel(cacheRes.uri))
        .then(() => {
          setLoading(false);
          sceneManagerRef.current?.setConfig(config);
          onLoaded?.();
        })
        .catch((err) => {
          setLoading(false);
          setLoadError(err?.message || 'Failed to switch avatar model');
          onError?.(err);
        });
    } else {
      sceneManagerRef.current.setConfig(config);
    }
  }, [config, currentModelId, getModelUrl, onLoaded, onError]);

  // Update camera preset
  useEffect(() => {
    sceneManagerRef.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset]);

  // Update speech state, audio levels, and word alignment
  useEffect(() => {
    sceneManagerRef.current?.setVoiceState(isSpeaking, audioLevel);
    if (wordAlignment) {
      sceneManagerRef.current?.setWordAlignment(wordAlignment);
    }
  }, [isSpeaking, audioLevel, wordAlignment]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
        sceneManagerRef.current = null;
      }
    };
  }, []);

  // GL Context Initialization
  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      glContextRef.current = gl;

      try {
        if (sceneManagerRef.current) {
          sceneManagerRef.current.dispose();
          sceneManagerRef.current = null;
        }

        const manager = new ThreeSceneManager({
          gl,
          config,
          cameraPreset,
          onModelLoaded: () => {
            setLoading(false);
            onLoaded?.();
          },
          onError: (err) => {
            setLoading(false);
            setLoadError(err.message);
            onError?.(err);
          },
        });

        sceneManagerRef.current = manager;

        const baseId = config.baseModelId || 'aria_photorealistic';
        const remoteUrl = getModelUrl(baseId);
        const cacheRes = await getCachedModelUri(remoteUrl, baseId);
        await manager.loadModel(cacheRes.uri);
        setLoading(false);
        setLoadError(null);
        onLoaded?.();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        setLoading(false);
        setLoadError(error.message);
        onError?.(error);
      }
    },
    [config, cameraPreset, getModelUrl, onLoaded, onError]
  );

  // If forced 2D or 3D failed, safely fall back to 2D
  if (force2D || loadError) {
    return (
      <View style={styles.container} testID={testID}>
        <Avatar2DFallback
          config={config}
          isSpeaking={isSpeaking}
          isListening={isListening}
          audioLevel={audioLevel}
          reason={loadError || (force2D ? '2D Mode Selected' : undefined)}
        />
        {loadError && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              if (glContextRef.current) {
                onContextCreate(glContextRef.current);
              }
            }}
          >
            <Text style={styles.retryButtonText}>Retry 3D</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>
            Loading{' '}
            {config.baseModelId === 'marcus_photorealistic' ||
            config.baseModelId === 'human_male_v1'
              ? 'Marcus'
              : 'Aria'}{' '}
            3D Avatar...
          </Text>
        </View>
      )}

      {/* Voice Badge */}
      <View style={styles.badgeContainer}>
        <View
          style={[
            styles.badgeDot,
            {
              backgroundColor: isSpeaking
                ? '#10b981'
                : isListening
                ? '#38bdf8'
                : '#64748b',
            },
          ]}
        />
        <Text style={styles.badgeText}>
          {isSpeaking ? 'Speaking' : isListening ? 'Listening' : 'Ready'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#090d16',
    position: 'relative',
    overflow: 'hidden',
  },
  glView: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 20,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  badgeContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 5,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  badgeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
});
