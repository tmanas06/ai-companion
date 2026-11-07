'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityConfig {
  tier: QualityTier;
  dpr: number;
  enableIBL: boolean;
  enableRectAreaLights: boolean;
  enableContactShadows: boolean;
  enablePostProcessing: boolean;
  textureResolution: 'full' | 'half' | 'quarter';
  shadowMapSize: number;
  antialias: boolean;
}

/**
 * Detects device capability and returns appropriate quality tier.
 * Based on hardware concurrency, device memory, and GPU renderer.
 */
export function detectQualityTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';

  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  let gpuTier = 'high';

  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const rendererLower = renderer.toLowerCase();
      // Detect integrated/low-end GPUs
      if (
        rendererLower.includes('intel') ||
        rendererLower.includes('adreno') ||
        rendererLower.includes('mali') ||
        rendererLower.includes('videocore') ||
        rendererLower.includes('llvmpipe') ||
        rendererLower.includes('swiftshader')
      ) {
        gpuTier = 'low';
      } else if (
        rendererLower.includes('amd') ||
        rendererLower.includes('radeon') ||
        rendererLower.includes('nvidia') ||
        rendererLower.includes('geforce')
      ) {
        gpuTier = 'high';
      }
    }
  }

  // Decision matrix
  if (hardwareConcurrency >= 8 && deviceMemory >= 8 && gpuTier === 'high') {
    return 'high';
  }
  if (hardwareConcurrency >= 4 && deviceMemory >= 4 && gpuTier !== 'low') {
    return 'medium';
  }
  return 'low';
}

export const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    dpr: 1.5,
    enableIBL: true,
    enableRectAreaLights: true,
    enableContactShadows: true,
    enablePostProcessing: true,
    textureResolution: 'full',
    shadowMapSize: 2048,
    antialias: true,
  },
  medium: {
    tier: 'medium',
    dpr: 1.2,
    enableIBL: true,
    enableRectAreaLights: true,
    enableContactShadows: true,
    enablePostProcessing: false,
    textureResolution: 'half',
    shadowMapSize: 1024,
    antialias: true,
  },
  low: {
    tier: 'low',
    dpr: 1.0,
    enableIBL: false,
    enableRectAreaLights: false,
    enableContactShadows: true,
    enablePostProcessing: false,
    textureResolution: 'quarter',
    shadowMapSize: 512,
    antialias: false,
  },
};

/**
 * Hook to get quality config based on device capability or manual override.
 */
export function useQualityConfig(
  manualTier?: QualityTier,
  options: { enableAutoDetect?: boolean } = {}
): QualityConfig {
  const { enableAutoDetect = true } = options;
  const [detectedTier, setDetectedTier] = useState<QualityTier>('high');

  useEffect(() => {
    if (enableAutoDetect && !manualTier) {
      setDetectedTier(detectQualityTier());
    }
  }, [enableAutoDetect, manualTier]);

  const effectiveTier = manualTier || detectedTier;
  return useMemo(() => QUALITY_PRESETS[effectiveTier], [effectiveTier]);
}

/**
 * Get canvas DPR from quality config.
 */
export function getCanvasDPR(config: QualityConfig): number {
  return config.dpr;
}

/**
 * Get renderer GL attributes from quality config.
 */
export function getRendererGLAttributes(config: QualityConfig) {
  return {
    antialias: config.antialias,
    alpha: false,
    powerPreference: 'high-performance' as const,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
  };
}