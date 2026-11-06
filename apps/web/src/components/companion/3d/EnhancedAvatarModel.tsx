'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  AvatarConfig,
  CompanionVoiceState,
  VisemeCue,
} from '../AvatarRenderer';
import {
  calculateActiveViseme,
  mapVoiceStateToAnimation,
  Companion3DAnimation,
  ModelBoundingMetrics,
} from './animation-mappings';
import { Avatar3DConfig, migrateAvatarConfig } from '@ai-companion/shared';

export interface EnhancedAvatarModelProps {
  modelUrl?: string;
  animationsUrl?: string;
  config?: AvatarConfig | Avatar3DConfig;
  state?: CompanionVoiceState;
  audioLevel?: number;
  isSpeaking?: boolean;
  visemes?: VisemeCue[];
  currentTime?: number;
  reducedMotion?: boolean;
  onMetricsLoaded?: (metrics: ModelBoundingMetrics) => void;
  onTapReaction?: (reactionType: 'head' | 'body') => void;
}

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeColor(hex: string | undefined, fallback: string): string {
  if (hex && HEX_COLOR_REGEX.test(hex)) return hex;
  return fallback;
}

export const EnhancedAvatarModel: React.FC<EnhancedAvatarModelProps> = ({
  modelUrl = '/models/aria_photorealistic.glb',
  animationsUrl = '/models/animations.glb',
  config,
  state = 'idle',
  audioLevel = 0,
  isSpeaking = false,
  visemes,
  currentTime,
  reducedMotion = false,
  onMetricsLoaded,
  onTapReaction,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const activeActionNameRef = useRef<string>('Idle');
  const [talkingVariant, setTalkingVariant] = useState<0 | 1 | 2>(0);
  const [interactiveReaction, setInteractiveReaction] = useState<string | null>(null);

  // Blinking state
  const isBlinkingRef = useRef(false);
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Viseme smoothing targets
  const currentVisemeTargetRef = useRef<string>('viseme_sil');
  const currentVisemeIntensityRef = useRef<number>(0);

  // Cached mesh references for performance
  const meshCacheRef = useRef<{
    baseMesh: THREE.SkinnedMesh | null;
    teethMesh: THREE.SkinnedMesh | null;
    eyeMeshes: THREE.Mesh[];
    hairMeshes: THREE.Mesh[];
    suitMesh: THREE.Mesh | null;
    shoeMeshes: THREE.Mesh[];
  }>({
    baseMesh: null,
    teethMesh: null,
    eyeMeshes: [],
    hairMeshes: [],
    suitMesh: null,
    shoeMeshes: [],
  });

  // Parse and migrate active 3D avatar configuration
  const parsed3DConfig = React.useMemo<Avatar3DConfig | null>(() => {
    if (!config) return null;
    if ((config as Avatar3DConfig).version === 2) {
      return migrateAvatarConfig(config);
    }
    return null;
  }, [config]);

  // Load avatar and animation GLBs
  const avatarGLTF = useGLTF(modelUrl);
  const animationsGLTF = useGLTF(animationsUrl);

  const activeSpeaking = isSpeaking || state === 'speaking';
  const isListening = state === 'listening';

  // 1. Initialize Animation Mixer and bind clips
  useEffect(() => {
    if (!avatarGLTF.scene) return;

    const availableClips =
      avatarGLTF.animations && avatarGLTF.animations.length > 0
        ? avatarGLTF.animations
        : animationsGLTF.animations;

    if (!availableClips || availableClips.length === 0) return;

    const mixer = new THREE.AnimationMixer(avatarGLTF.scene);
    mixerRef.current = mixer;

    const actions: Record<string, THREE.AnimationAction> = {};
    availableClips.forEach((clip) => {
      const action = mixer.clipAction(clip);
      actions[clip.name] = action;
      const baseName = clip.name.replace(/_([a-zA-Z0-9\.]+)$/, '');
      if (baseName && !actions[baseName]) {
        actions[baseName] = action;
      }
    });
    actionsRef.current = actions;

    const idleAction = actions['Idle'] || actions['Idle_Human.rig'] || actions['Idle_Armature'];
    if (idleAction) {
      idleAction.play();
      activeActionNameRef.current = 'Idle';
    }

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [avatarGLTF.scene, avatarGLTF.animations, animationsGLTF.animations]);

  // 2. Compute model bounding box and enhance materials with PhysicalMaterial + SSS
  useEffect(() => {
    if (!avatarGLTF.scene) return;

    // Compute exact anatomical bounding box metrics
    const box = new THREE.Box3().setFromObject(avatarGLTF.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = size.y;

    const metrics: ModelBoundingMetrics = {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
      size: [size.x, size.y, size.z],
      center: [center.x, center.y, center.z],
      height,
      headY: box.max.y - 0.14,
      eyeY: box.max.y - 0.10,
      chestY: center.y + 0.35,
      pelvisY: center.y,
    };

    onMetricsLoaded?.(metrics);

    // Enhance PBR material fidelity with MeshPhysicalMaterial + SSS approximation
    avatarGLTF.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const meshName = (mesh.name || '').toLowerCase();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        // Cache important mesh references
        if (meshName === 'base' || meshName === 'human') {
          meshCacheRef.current.baseMesh = mesh as THREE.SkinnedMesh;
        }
        if (meshName.includes('teeth')) {
          meshCacheRef.current.teethMesh = mesh as THREE.SkinnedMesh;
        }
        if (meshName.includes('eye') || meshName === 'low-poly') {
          meshCacheRef.current.eyeMeshes.push(mesh);
        }
        if (meshName.includes('hair') || meshName.includes('ponytail')) {
          meshCacheRef.current.hairMeshes.push(mesh);
        }
        if (meshName.includes('suit') || meshName.includes('elegantsuit') || meshName.includes('clothes')) {
          meshCacheRef.current.suitMesh = mesh;
        }
        if (meshName.includes('shoe')) {
          meshCacheRef.current.shoeMeshes.push(mesh);
        }

        // Hairstyle visibility toggle
        if (meshName.includes('ponytail') || meshName.includes('short02') || meshName.includes('hair')) {
          if (parsed3DConfig) {
            mesh.visible = parsed3DConfig.hair.assetId !== 'none';
          }
        }

        materials.forEach((m) => {
          if (!m) return;
          const mat = m as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
          const name = ((mesh.name || '') + ' ' + (mat.name || '')).toLowerCase();

          // Upgrade to MeshPhysicalMaterial for skin, eyes, teeth
          if (
            name.includes('skin') ||
            name.includes('head') ||
            name.includes('body') ||
            meshName.includes('human') ||
            (meshName === 'base' && mat.name === 'Human.body')
          ) {
            upgradeToPhysicalSkin(mat, parsed3DConfig, meshName);
          } else if (meshName.includes('eye') || meshName.includes('low-poly')) {
            upgradeToPhysicalEye(mat, parsed3DConfig, meshName);
          } else if (meshName.includes('teeth')) {
            upgradeToPhysicalTeeth(mat, parsed3DConfig);
          } else if (
            meshName.includes('hair') ||
            meshName.includes('ponytail') ||
            meshName.includes('bob') ||
            meshName.includes('braid') ||
            meshName.includes('eyebrow') ||
            meshName.includes('eyelash') ||
            meshName.includes('short02') ||
            meshName.includes('long01')
          ) {
            upgradeHairMaterial(mat, parsed3DConfig, meshName);
          } else if (
            meshName.includes('suit') ||
            meshName.includes('elegantsuit') ||
            meshName.includes('clothes')
          ) {
            upgradeClothingMaterial(mat, parsed3DConfig, meshName);
          } else if (meshName.includes('shoe')) {
            upgradeShoeMaterial(mat, meshName);
          }

          mat.needsUpdate = true;
        });
      }
    });

    // Separate eye geometry if possible (cornea / iris / sclera split)
    separateEyeGeometry();

    return () => {
      // GPU Memory Cleanup
      avatarGLTF.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m) {
              const record = m as unknown as Record<string, unknown>;
              Object.keys(record).forEach((prop) => {
                const val = record[prop];
                if (val && typeof val === 'object' && 'isTexture' in val) {
                  (val as THREE.Texture).dispose();
                }
              });
              m.dispose();
            }
          });
        }
      });
    };
  }, [avatarGLTF.scene, onMetricsLoaded, parsed3DConfig]);

  // Material upgrade functions
  function upgradeToPhysicalSkin(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    config: Avatar3DConfig | null,
    meshName: string
  ) {
    if (!(mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
      // Convert to MeshPhysicalMaterial
      const physMat = new THREE.MeshPhysicalMaterial({
        color: mat.color,
        map: mat.map,
        normalMap: mat.normalMap,
        normalScale: mat.normalScale,
        roughnessMap: mat.roughnessMap,
        metalnessMap: mat.metalnessMap,
        roughness: config?.materials.skinRoughness ?? 0.52,
        metalness: 0.0,
        // SSS approximation via transmission
        transmission: 0.12,
        thickness: 0.4,
        attenuationDistance: 0.8,
        attenuationColor: new THREE.Color('#ffdbc8'),
        // Sheen for micro-fiber fuzz
        sheen: 0.35,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#ffdfd3'),
        // Clearcoat for oily T-zone
        clearcoat: 0.08,
        clearcoatRoughness: 0.3,
      });
      // Copy over textures
      if (mat.map) physMat.map = mat.map;
      if (mat.normalMap) {
        physMat.normalMap = mat.normalMap;
        physMat.normalScale = new THREE.Vector2(0.22, 0.22);
      }
      if (mat.roughnessMap) physMat.roughnessMap = mat.roughnessMap;
      if (mat.metalnessMap) physMat.metalnessMap = mat.metalnessMap;
      // Replace material
      Object.assign(mat, physMat);
      mat.dispose();
    } else {
      const physMat = mat as THREE.MeshPhysicalMaterial;
      physMat.roughness = config?.materials.skinRoughness ?? 0.52;
      physMat.metalness = 0.0;
      physMat.transmission = 0.12;
      physMat.thickness = 0.4;
      physMat.attenuationDistance = 0.8;
      physMat.attenuationColor = new THREE.Color('#ffdbc8');
      physMat.sheen = 0.35;
      physMat.sheenRoughness = 0.5;
      physMat.sheenColor = new THREE.Color('#ffdfd3');
      physMat.clearcoat = 0.08;
      physMat.clearcoatRoughness = 0.3;
      if (mat.normalMap) {
        physMat.normalScale = new THREE.Vector2(0.22, 0.22);
      }
    }

    // Apply skin tone tint if customized
    if (config && (mat.name === 'Human.body' || meshName.includes('skin'))) {
      mat.color.set(safeColor(config.materials.skinTone, '#E8B590'));
    }
  }

  function upgradeToPhysicalEye(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    config: Avatar3DConfig | null,
    meshName: string
  ) {
    if (!(mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
      const physMat = new THREE.MeshPhysicalMaterial({
        color: mat.color,
        map: mat.map,
        roughness: config?.materials.eyeRoughness ?? 0.04,
        metalness: 0.0,
        transmission: 0.95, // Corneal transparency
        thickness: 0.01,
        ior: 1.376,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
      });
      if (mat.map) physMat.map = mat.map;
      if (mat.normalMap) physMat.normalMap = mat.normalMap;
      Object.assign(mat, physMat);
      mat.dispose();
    } else {
      const physMat = mat as THREE.MeshPhysicalMaterial;
      physMat.roughness = config?.materials.eyeRoughness ?? 0.04;
      physMat.metalness = 0.0;
      physMat.transmission = 0.95;
      physMat.thickness = 0.01;
      physMat.ior = 1.376;
      physMat.clearcoat = 1.0;
      physMat.clearcoatRoughness = 0.0;
    }

    if (config && (mat.name === 'Human.low-poly' || meshName.includes('eye'))) {
      mat.color.set(safeColor(config.materials.eyeColor, '#3B2219'));
    }
  }

  function upgradeToPhysicalTeeth(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    config: Avatar3DConfig | null
  ) {
    if (!(mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
      const physMat = new THREE.MeshPhysicalMaterial({
        color: mat.color,
        map: mat.map,
        roughness: config?.materials.teethRoughness ?? 0.12,
        metalness: 0.0,
        transmission: 0.25,
        thickness: 0.5,
        attenuationDistance: 1.0,
        attenuationColor: new THREE.Color('#ffeedd'),
      });
      if (mat.map) physMat.map = mat.map;
      Object.assign(mat, physMat);
      mat.dispose();
    } else {
      const physMat = mat as THREE.MeshPhysicalMaterial;
      physMat.roughness = config?.materials.teethRoughness ?? 0.12;
      physMat.metalness = 0.0;
      physMat.transmission = 0.25;
      physMat.thickness = 0.5;
      physMat.attenuationDistance = 1.0;
      physMat.attenuationColor = new THREE.Color('#ffeedd');
    }
  }

  function upgradeHairMaterial(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    config: Avatar3DConfig | null,
    meshName: string
  ) {
    mat.alphaTest = 0.5;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    mat.roughness = config?.hair.roughness ?? 0.45;
    mat.metalness = 0.02;
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.clearcoat = 0.15;
      mat.clearcoatRoughness = 0.25;
      mat.sheen = 0.4;
      mat.sheenRoughness = 0.4;
      mat.anisotropy = 0.3;
    }
    if (config && (meshName.includes('ponytail') || meshName.includes('hair'))) {
      mat.color.set(safeColor(config.hair.color, '#2C1B14'));
    }
  }

  function upgradeClothingMaterial(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    config: Avatar3DConfig | null,
    meshName: string
  ) {
    mat.roughness = 0.82;
    mat.metalness = 0.0;
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.sheen = 0.15;
      mat.sheenRoughness = 0.5;
      mat.sheenColor = new THREE.Color('#3a4050');
    }
    if (config && config.clothing.topColor) {
      mat.color.set(safeColor(config.clothing.topColor, '#232938'));
    }
  }

  function upgradeShoeMaterial(
    mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
    meshName: string
  ) {
    mat.roughness = 0.55;
    mat.metalness = 0.05;
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.clearcoat = 0.1;
      mat.clearcoatRoughness = 0.3;
    }
  }

  // Separate eye geometry into cornea/iris/sclera if geometry supports it
  function separateEyeGeometry() {
    if (!avatarGLTF.scene) return;

    avatarGLTF.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const meshName = child.name.toLowerCase();
      if (meshName === 'low-poly' || meshName.includes('eye')) {
        const mesh = child as THREE.Mesh;
        // If the eye mesh has multiple material slots, we can assign different materials
        // For now, we'll rely on the upgraded physical eye material
        // A full separation would require geometry splitting which is complex at runtime
      }
    });
  }

  // Rotate talking animation variants
  useEffect(() => {
    if (activeSpeaking) {
      const interval = setInterval(() => {
        setTalkingVariant((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
      }, 3500);
      return () => clearInterval(interval);
    } else {
      setTalkingVariant(0);
    }
  }, [activeSpeaking]);

  // Animation transitions
  const playAnimation = useCallback(
    (name: Companion3DAnimation, duration: number = 0.35) => {
      const mixer = mixerRef.current;
      const actions = actionsRef.current;
      if (!mixer || !actions[name]) return;

      const currentName = activeActionNameRef.current;
      if (currentName === name) return;

      const currentAction = actions[currentName];
      const nextAction = actions[name];

      nextAction.reset();
      nextAction.fadeIn(reducedMotion ? 0 : duration);
      nextAction.play();

      if (currentAction) {
        currentAction.fadeOut(reducedMotion ? 0 : duration);
      }

      activeActionNameRef.current = name;
    },
    [reducedMotion]
  );

  // Voice State Machine -> Animation Controller
  useEffect(() => {
    if (interactiveReaction) {
      playAnimation(interactiveReaction as Companion3DAnimation, 0.25);
      return;
    }

    if (state === 'interrupted') {
      playAnimation('Idle', 0.15);
      return;
    }

    const targetClip = mapVoiceStateToAnimation(state, talkingVariant);
    playAnimation(targetClip, 0.4);
  }, [state, talkingVariant, interactiveReaction, playAnimation]);

  // Natural Blinking Cycle
  useEffect(() => {
    let active = true;

    const scheduleNextBlink = () => {
      const baseDelay = isListening ? 4500 : 3200;
      const jitter = isListening ? 2800 : 2300;
      const delay = baseDelay + Math.random() * jitter;

      blinkTimerRef.current = setTimeout(() => {
        if (!active) return;
        isBlinkingRef.current = true;

        setTimeout(() => {
          if (!active) return;
          isBlinkingRef.current = false;
          scheduleNextBlink();
        }, 140);
      }, delay);
    };

    scheduleNextBlink();

    return () => {
      active = false;
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
    };
  }, [isListening]);

  // Interactive Click/Tap Handler
  const handlePointerDown = (event: { stopPropagation: () => void; object: THREE.Object3D }) => {
    event.stopPropagation();

    if (activeSpeaking || state === 'listening' || state === 'processing_speech') {
      return;
    }

    const meshName = event.object.name || '';
    if (meshName.includes('Head') || meshName.includes('Hair') || meshName.includes('Eye')) {
      setInteractiveReaction('Laughing');
      onTapReaction?.('head');
      setTimeout(() => {
        setInteractiveReaction(null);
      }, 2400);
    } else {
      setInteractiveReaction('Talking_1');
      onTapReaction?.('body');
      setTimeout(() => {
        setInteractiveReaction(null);
      }, 2600);
    }
  };

  // Per-frame Morph Target & Lip Sync Update Loop
  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    if (activeSpeaking) {
      const { targetName, intensity } = calculateActiveViseme(
        currentTime,
        visemes,
        audioLevel
      );
      currentVisemeTargetRef.current = targetName;
      const naturalIntensity = Math.min(0.52, intensity * 0.65);
      currentVisemeIntensityRef.current +=
        (naturalIntensity - currentVisemeIntensityRef.current) * 0.4;
    } else {
      currentVisemeTargetRef.current = 'viseme_sil';
      currentVisemeIntensityRef.current += (0 - currentVisemeIntensityRef.current) * 0.55;
    }

    const baseJaw = parsed3DConfig
      ? Math.max(0, ((parsed3DConfig.face.chinLength ?? 0.5) - 0.5) * 0.15)
      : 0;

    // Apply morph targets using cached references
    const baseMesh = meshCacheRef.current.baseMesh;
    const teethMesh = meshCacheRef.current.teethMesh;

    if (baseMesh && baseMesh.morphTargetDictionary && baseMesh.morphTargetInfluences) {
      applyMorphTargets(baseMesh, baseJaw);
    }
    if (teethMesh && teethMesh.morphTargetDictionary && teethMesh.morphTargetInfluences) {
      applyTeethMorphTargets(teethMesh);
    }

    // Body scaling
    if (groupRef.current && parsed3DConfig?.body?.height) {
      const clampedH = THREE.MathUtils.clamp(parsed3DConfig.body.height, 0.85, 1.15);
      groupRef.current.scale.set(clampedH, clampedH, clampedH);
    }

    // Subtle Organic Spine Breathing Motion
    if (!reducedMotion && groupRef.current) {
      const time = performance.now() * 0.0018;
      const spine = groupRef.current.getObjectByName('Spine');
      if (spine) {
        spine.rotation.x = Math.sin(time) * 0.015;
      }
    }
  });

  function applyMorphTargets(mesh: THREE.SkinnedMesh, baseJaw: number) {
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dict || !influences) return;

    const activeViseme = currentVisemeTargetRef.current;
    const activeIntensity = currentVisemeIntensityRef.current;

    // Facial Customization Morphs
    if (parsed3DConfig) {
      const setInfluence = (key: string, value: number) => {
        const idx = dict[key];
        if (idx !== undefined && influences[idx] !== undefined) {
          influences[idx] = value;
        }
      };

      setInfluence('jawForward', parsed3DConfig.face.jawWidth * 0.7);
      setInfluence('$md-$ca-$fe-$yn', parsed3DConfig.face.chinLength * 0.5);
      setInfluence('cheekSquintLeft', parsed3DConfig.face.cheekboneHeight * 0.65);
      setInfluence('cheekSquintRight', parsed3DConfig.face.cheekboneHeight * 0.65);
      setInfluence('cheekPuff', (parsed3DConfig.face.cheekboneFullness ?? 0.5) * 0.6);
      setInfluence('eyeWideLeft', parsed3DConfig.face.eyeSize * 0.55);
      setInfluence('eyeWideRight', parsed3DConfig.face.eyeSize * 0.55);
      setInfluence('noseSneerLeft', parsed3DConfig.face.noseBridgeWidth * 0.45);
      setInfluence('noseSneerRight', parsed3DConfig.face.noseBridgeWidth * 0.45);
      setInfluence('mouthRollUpper', parsed3DConfig.face.lipFullnessUpper * 0.6);
      setInfluence('mouthRollLower', parsed3DConfig.face.lipFullnessLower * 0.6);
      setInfluence('mouthStretchLeft', parsed3DConfig.face.mouthWidth * 0.5);
      setInfluence('mouthStretchRight', parsed3DConfig.face.mouthWidth * 0.5);
    }

    // Blinking
    const blinkIdxL = dict['eyeBlinkLeft'];
    const blinkIdxR = dict['eyeBlinkRight'];
    if (blinkIdxL !== undefined && blinkIdxR !== undefined) {
      const targetBlink = isBlinkingRef.current ? 1.0 : 0.0;
      if (influences[blinkIdxL] !== undefined) {
        influences[blinkIdxL] += (targetBlink - influences[blinkIdxL]!) * 0.45;
      }
      if (influences[blinkIdxR] !== undefined) {
        influences[blinkIdxR] += (targetBlink - influences[blinkIdxR]!) * 0.45;
      }
    }

    // Viseme & Speech
    for (const key in dict) {
      if (key.startsWith('viseme_') || key === 'mouthOpen' || key === 'jawOpen') {
        const idx = dict[key];
        if (idx !== undefined && influences[idx] !== undefined) {
          if (key === 'jawOpen') {
            const targetJaw = (key === activeViseme && activeSpeaking)
              ? Math.min(0.52, baseJaw + activeIntensity)
              : baseJaw;
            const rate = activeSpeaking ? 0.45 : 0.55;
            influences[idx] += (targetJaw - influences[idx]!) * rate;
          } else if (key === activeViseme && activeSpeaking) {
            influences[idx] += (activeIntensity - influences[idx]!) * 0.45;
          } else {
            influences[idx] += (0 - influences[idx]!) * (activeSpeaking ? 0.35 : 0.6);
          }
        }
      }
    }

    // Smile
    const smileLeft = dict['mouthSmileLeft'];
    const smileRight = dict['mouthSmileRight'];
    if (smileLeft !== undefined && smileRight !== undefined) {
      const smileTarget = activeSpeaking ? 0.12 : (isListening ? 0.28 : 0.18);
      if (influences[smileLeft] !== undefined) {
        influences[smileLeft] += (smileTarget - influences[smileLeft]!) * 0.15;
      }
      if (influences[smileRight] !== undefined) {
        influences[smileRight] += (smileTarget - influences[smileRight]!) * 0.15;
      }
    }
  }

  function applyTeethMorphTargets(mesh: THREE.SkinnedMesh) {
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dict || !influences) return;

    const teethJaw = dict['jawOpen'];
    const activeIntensity = currentVisemeIntensityRef.current;
    if (teethJaw !== undefined && influences[teethJaw] !== undefined) {
      const teethTarget = activeSpeaking ? activeIntensity * 0.35 : 0;
      influences[teethJaw] += (teethTarget - influences[teethJaw]!) * 0.45;
    }
  }

  return (
    <group
      ref={groupRef}
      dispose={null}
      position={[0, 0, 0]}
      onPointerDown={handlePointerDown}
    >
      <primitive object={avatarGLTF.scene} />
    </group>
  );
};

// Preload models
useGLTF.preload('/models/aria_photorealistic.glb');
useGLTF.preload('/models/animations.glb');