'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import * as THREE from 'three';
import { ContactShadows } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { RectAreaLight } from './RectAreaLight';
import { QualityConfig } from './quality';

export interface EnhancedStudioEnvironmentProps {
  reducedMotion?: boolean;
  onHdriLoaded?: (loaded: boolean) => void;
  qualityConfig?: QualityConfig;
}

/**
 * Enhanced Studio Environment with IBL (Image-Based Lighting) and Area Lights.
 * Replaces directional lights with RectAreaLights for soft, realistic shadows.
 * Uses HDRI environment map for natural reflections and ambient illumination.
 */
export const EnhancedStudioEnvironment: React.FC<EnhancedStudioEnvironmentProps> = ({
  onHdriLoaded,
  qualityConfig,
}) => {
  const hdriRef = useRef<THREE.Texture | null>(null);
  const [hdriError, setHdriError] = useState(false);
  const { scene } = useThree();

  const enableIBL = qualityConfig?.enableIBL ?? true;
  const enableRectAreaLights = qualityConfig?.enableRectAreaLights ?? true;
  const enableContactShadows = qualityConfig?.enableContactShadows ?? true;

  useEffect(() => {
    // Initialize RectAreaLight uniforms
    RectAreaLightUniformsLib.init();

    // Load HDRI environment map only if IBL is enabled
    if (enableIBL) {
      const loader = new RGBELoader();
      loader.load(
        '/models/studio_hdri.hdr',
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          hdriRef.current = texture;
          // Apply to scene.environment for IBL on all PhysicalMaterials
          scene.environment = texture;
          scene.background = texture;
          onHdriLoaded?.(true);
        },
        undefined,
        (err) => {
          console.warn('[EnhancedStudioEnvironment] Failed to load HDRI, using fallback lighting:', err);
          setHdriError(true);
          onHdriLoaded?.(false);
        }
      );
    } else {
      onHdriLoaded?.(false);
    }

    return () => {
      if (hdriRef.current) {
        hdriRef.current.dispose();
        hdriRef.current = null;
      }
      // Clear environment on unmount
      scene.environment = null;
      scene.background = new THREE.Color('#0a0f1a');
    };
  }, [scene, enableIBL, onHdriLoaded]);

  // Fallback lighting when HDRI fails to load
  const useFallback = hdriError || !enableIBL;

  return (
    <group name="EnhancedStudioEnvironment">
      {/* HDRI Environment Map (provides IBL for all PhysicalMaterials) */}
      {hdriRef.current && enableIBL && (
        <primitive
          object={hdriRef.current}
          dispose={null}
        />
      )}

      {/* Hemispheric Ambient Bounce (fallback when HDRI not loaded) */}
      {useFallback && (
        <hemisphereLight
          args={['#f8fafc', '#1e293b', 0.55]}
        />
      )}

      {/* Area Lights (only enabled on medium/high quality) */}
      {enableRectAreaLights && (
        <>
          {/* Key Light: Large RectAreaLight for soft, wrapping facial illumination */}
          <RectAreaLight
            position={[2.0, 3.5, 2.5]}
            color="#fffaf0"
            intensity={12}
            width={2.2}
            height={2.8}
            lookAt={[0, 1.6, 0]}
          />

          {/* Fill Light: Softer, cooler RectAreaLight to lift shadows */}
          <RectAreaLight
            position={[-2.8, 2.2, 2.0]}
            color="#e2e8f0"
            intensity={6}
            width={2.5}
            height={3.2}
            lookAt={[0, 1.6, 0]}
          />

          {/* Rim Light: Warm edge highlight separating hair/shoulders from background */}
          <RectAreaLight
            position={[0.3, 3.0, -2.8]}
            color="#fed7aa"
            intensity={8}
            width={1.5}
            height={3.5}
            lookAt={[0, 1.6, 0]}
          />
        </>
      )}

      {/* Eye Catchlight: Small bright point light for corneal highlights */}
      <pointLight
        position={[0, 1.65, 1.3]}
        intensity={0.4}
        color="#ffffff"
        distance={3.5}
      />

      {/* Architectural Studio Floor Plane */}
      <mesh
        position={[0, -0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>

      {/* Seamless Curved Studio Cyclorama */}
      <mesh position={[0, 7.5, 0]} receiveShadow>
        <sphereGeometry args={[28, 48, 32]} />
        <meshStandardMaterial
          color="#0a0f1a"
          roughness={0.92}
          metalness={0.0}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Natural Soft Floor Contact Shadows */}
      {enableContactShadows && (
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.7}
          scale={4.5}
          blur={2.2}
          far={2.8}
          resolution={1024}
          color="#050810"
        />
      )}
    </group>
  );
};