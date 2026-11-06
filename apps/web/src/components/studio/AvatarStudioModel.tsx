'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Avatar3DConfig } from '@ai-companion/shared';

interface AvatarStudioModelProps {
  config: Avatar3DConfig;
  modelUrl?: string;
  animationsUrl?: string;
  isTestSpeaking?: boolean;
}

export const AvatarStudioModel: React.FC<AvatarStudioModelProps> = ({
  config,
  modelUrl = '/models/aria_photorealistic.glb',
  animationsUrl = '/models/animations.glb',
  isTestSpeaking = false,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  // Blinking animation state
  const isBlinkingRef = useRef(false);
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load avatar GLTF
  const avatarGLTF = useGLTF(modelUrl);
  const animationsGLTF = useGLTF(animationsUrl);

  // 1. Initialize Animation Mixer and start Idle loop
  useEffect(() => {
    if (!avatarGLTF.scene) return;

    const clips =
      avatarGLTF.animations && avatarGLTF.animations.length > 0
        ? avatarGLTF.animations
        : animationsGLTF.animations;

    if (!clips || clips.length === 0) return;

    const mixer = new THREE.AnimationMixer(avatarGLTF.scene);
    mixerRef.current = mixer;

    const idleClip = clips.find(
      (c) => c.name === 'Idle' || c.name.startsWith('Idle')
    ) || clips[0];

    if (idleClip) {
      const action = mixer.clipAction(idleClip);
      action.play();
    }

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [avatarGLTF.scene, avatarGLTF.animations, animationsGLTF.animations]);

  // 2. Schedule Natural Blinking
  useEffect(() => {
    const scheduleNextBlink = () => {
      const delay = 3200 + Math.random() * 2800;
      blinkTimerRef.current = setTimeout(() => {
        isBlinkingRef.current = true;
        setTimeout(() => {
          isBlinkingRef.current = false;
          scheduleNextBlink();
        }, 140);
      }, delay);
    };

    scheduleNextBlink();
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, []);

  // 3. Per-frame Morph Target & Material Updates
  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    if (!avatarGLTF.scene) return;

    const time = performance.now() * 0.003;
    const speechAperture = isTestSpeaking ? Math.sin(time * 3) * 0.35 + 0.35 : 0;

    avatarGLTF.scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.SkinnedMesh;
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        // Apply morphs to the base face mesh
        if (dict && influences && (mesh.name === 'base' || mesh.name === 'Human' || dict['jawForward'] !== undefined)) {
          // A. Blinking
          const blinkL = dict['eyeBlinkLeft'];
          const blinkR = dict['eyeBlinkRight'];
          if (
            blinkL !== undefined &&
            blinkR !== undefined &&
            influences[blinkL] !== undefined &&
            influences[blinkR] !== undefined
          ) {
            const targetBlink = isBlinkingRef.current ? 1.0 : 0.0;
            influences[blinkL] = influences[blinkL]! + (targetBlink - influences[blinkL]!) * 0.45;
            influences[blinkR] = influences[blinkR]! + (targetBlink - influences[blinkR]!) * 0.45;
          }

          // B. Facial Morph Parameters (Genuinely affecting vertex buffers)
          // 1. Jaw & Chin Projection
          const jawFwd = dict['jawForward'];
          if (jawFwd !== undefined) {
            influences[jawFwd] = config.face.jawWidth * 0.7;
          }

          // 2. Cheekbone Height & Fullness
          const cheekSquintL = dict['cheekSquintLeft'];
          const cheekSquintR = dict['cheekSquintRight'];
          if (cheekSquintL !== undefined && cheekSquintR !== undefined) {
            influences[cheekSquintL] = config.face.cheekboneHeight * 0.65;
            influences[cheekSquintR] = config.face.cheekboneHeight * 0.65;
          }

          const cheekPuff = dict['cheekPuff'];
          if (cheekPuff !== undefined) {
            influences[cheekPuff] = (config.face.cheekboneFullness ?? 0.5) * 0.6;
          }

          // 3. Eyes Size & Aperture
          const eyeWideL = dict['eyeWideLeft'];
          const eyeWideR = dict['eyeWideRight'];
          if (eyeWideL !== undefined && eyeWideR !== undefined) {
            influences[eyeWideL] = config.face.eyeSize * 0.55;
            influences[eyeWideR] = config.face.eyeSize * 0.55;
          }

          // 4. Nose Bridge & Flare
          const noseSneerL = dict['noseSneerLeft'];
          const noseSneerR = dict['noseSneerRight'];
          if (noseSneerL !== undefined && noseSneerR !== undefined) {
            influences[noseSneerL] = config.face.noseBridgeWidth * 0.45;
            influences[noseSneerR] = config.face.noseBridgeWidth * 0.45;
          }

          // 5. Lip Fullness & Mouth Width
          const mouthRollUp = dict['mouthRollUpper'];
          const mouthRollLo = dict['mouthRollLower'];
          if (mouthRollUp !== undefined && mouthRollLo !== undefined) {
            influences[mouthRollUp] = config.face.lipFullnessUpper * 0.6;
            influences[mouthRollLo] = config.face.lipFullnessLower * 0.6;
          }

          const mouthStretchL = dict['mouthStretchLeft'];
          const mouthStretchR = dict['mouthStretchRight'];
          if (mouthStretchL !== undefined && mouthStretchR !== undefined) {
            influences[mouthStretchL] = config.face.mouthWidth * 0.5;
            influences[mouthStretchR] = config.face.mouthWidth * 0.5;
          }

          // 6. Speech Animation Preview
          const visemeAA = dict['viseme_aa'];
          const mouthOpen = dict['mouthOpen'];
          const jawOpen = dict['jawOpen'];
          if (visemeAA !== undefined && mouthOpen !== undefined && jawOpen !== undefined) {
            influences[visemeAA] = speechAperture * 0.7;
            influences[mouthOpen] = speechAperture * 0.5;
            influences[jawOpen] = speechAperture * 0.35;
          }

          // 7. Demographic contour morphs
          const macroCau = dict['$md-$ca-$fe-$yn'];
          if (macroCau !== undefined) {
            // Balances jaw taper and nose contour
            influences[macroCau] = config.face.chinLength * 0.5;
          }
        }

        // Apply Teeth mouth open during test speech
        if (dict && influences && mesh.name.includes('teeth')) {
          const teethJaw = dict['jawOpen'];
          if (teethJaw !== undefined) {
            influences[teethJaw] = speechAperture * 0.4;
          }
        }
      }

      // 4. Material Tinting & Visibility
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = (mesh.name || '').toLowerCase();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        // Hairstyle visibility toggle
        if (name.includes('ponytail') || name.includes('short02') || name.includes('hair')) {
          mesh.visible = config.hair.assetId !== 'none';
        }

        mats.forEach((m) => {
          if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
          const mat = m as THREE.MeshStandardMaterial;

          // Skin tone tinting
          if (mat.name === 'Human.body' || name === 'base' || name.includes('skin') || name === 'human') {
            mat.color.set(config.materials.skinTone);
            mat.roughness = config.materials.skinRoughness ?? 0.6;
          }

          // Hair color tinting
          if (mat.name.includes('ponytail') || mat.name.includes('hair') || name.includes('hair')) {
            mat.color.set(config.hair.color);
            mat.roughness = config.hair.roughness ?? 0.8;
          }

          // Eye color tinting
          if (mat.name === 'Human.low-poly' || name.includes('eye')) {
            mat.color.set(config.materials.eyeColor);
          }

          // Clothing tinting
          if (mat.name.includes('elegantsuit') || name.includes('suit') || name.includes('cloth')) {
            if (config.clothing.topColor) {
              mat.color.set(config.clothing.topColor);
            }
          }
        });
      }
    });

    // Body scaling (height)
    if (groupRef.current) {
      const h = config.body?.height ?? 1.0;
      groupRef.current.scale.set(h, h, h);
    }
  });

  return (
    <group ref={groupRef} dispose={null} position={[0, 0, 0]}>
      <primitive object={avatarGLTF.scene} />
    </group>
  );
};
