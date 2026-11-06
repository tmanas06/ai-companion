'use client';

import React from 'react';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export interface StudioEnvironmentProps {
  reducedMotion?: boolean;
}

/**
 * Restrained, polished contemporary studio environment.
 * Replaces dark voids and flat surfaces with a clean architectural cyclorama,
 * balanced 3-point soft portrait lighting (key, fill, rim, and corneal catchlight),
 * and soft grounded contact shadows calibrated for human characters on Intel Iris Xe.
 */
export const StudioEnvironment: React.FC<StudioEnvironmentProps> = () => {
  return (
    <group name="StudioEnvironment">
      {/* 1. Hemispheric Ambient Bounce (soft sky/ground bounce avoiding harsh black shadows) */}
      <hemisphereLight
        args={['#f8fafc', '#1e293b', 0.65]}
      />

      {/* 2. Key Light: Warm soft main light creating natural human facial contours */}
      <directionalLight
        position={[2.2, 3.8, 2.8]}
        intensity={1.45}
        color="#fffaf0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-2.2}
        shadow-camera-right={2.2}
        shadow-camera-top={3.2}
        shadow-camera-bottom={-0.8}
      />

      {/* 3. Fill Light: Soft slate fill to lift chin/eye socket shadows naturally */}
      <directionalLight
        position={[-2.6, 2.0, 2.2]}
        intensity={0.6}
        color="#e2e8f0"
      />

      {/* 4. Hair & Shoulder Rim Light: Soft rear highlight separating hair and shoulders from background */}
      <directionalLight
        position={[0.2, 3.2, -2.6]}
        intensity={0.95}
        color="#fed7aa"
      />

      {/* 5. Subtle Eye & Facial Catchlight: Brings life to irises without washing out skin */}
      <pointLight
        position={[0, 1.65, 1.3]}
        intensity={0.35}
        color="#ffffff"
        distance={3.2}
      />

      {/* 6. Architectural Studio Floor Plane */}
      <mesh
        position={[0, -0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color="#181b24"
          roughness={0.82}
          metalness={0.02}
        />
      </mesh>

      {/* 7. Seamless Curved Studio Cyclorama (Wall & ceiling enclosure) */}
      <mesh position={[0, 7.5, 0]} receiveShadow>
        <sphereGeometry args={[26, 48, 32]} />
        <meshStandardMaterial
          color="#1e222e"
          roughness={0.92}
          metalness={0.0}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 8. Natural Soft Floor Contact Shadows (Grounds feet firmly on floor without floating) */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.65}
        scale={4.2}
        blur={2.0}
        far={2.6}
        resolution={1024}
        color="#080c14"
      />
    </group>
  );
};

