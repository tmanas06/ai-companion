'use client';

import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

interface RectAreaLightProps {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
  intensity?: number;
  width?: number;
  height?: number;
  lookAt?: [number, number, number];
}

export const RectAreaLight: React.FC<RectAreaLightProps> = ({
  position = [0, 0, 0],
  color = 0xffffff,
  intensity = 1,
  width = 1,
  height = 1,
  lookAt,
}) => {
  const { scene } = useThree();
  const lightRef = useRef<THREE.RectAreaLight | null>(null);

  useEffect(() => {
    // Initialize RectAreaLight uniforms
    RectAreaLightUniformsLib.init();

    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.position.set(...position);
    if (lookAt) {
      light.lookAt(...lookAt);
    }
    lightRef.current = light;
    scene.add(light);

    return () => {
      scene.remove(light);
      light.dispose();
    };
  }, [scene, position, color, intensity, width, height, lookAt]);

  // Update light properties when props change
  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.color.set(color);
      lightRef.current.intensity = intensity;
      lightRef.current.width = width;
      lightRef.current.height = height;
      lightRef.current.position.set(...position);
      if (lookAt) {
        lightRef.current.lookAt(...lookAt);
      }
    }
  }, [color, intensity, width, height, position, lookAt]);

  return null; // This component doesn't render JSX directly
};

export default RectAreaLight;