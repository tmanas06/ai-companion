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

export interface FullBodyAvatarModelProps {
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

export const FullBodyAvatarModel: React.FC<FullBodyAvatarModelProps> = ({
  modelUrl = '/models/aria_photorealistic.glb?v=5',
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

  // 1. Initialize Animation Mixer and bind clips (prefers native embedded animations)
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
      // Register under base name without armature suffix (e.g. "Idle_Human.rig" -> "Idle", "Idle_Armature" -> "Idle")
      const baseName = clip.name.replace(/_([a-zA-Z0-9\.]+)$/, '');
      if (baseName && !actions[baseName]) {
        actions[baseName] = action;
      }
    });
    actionsRef.current = actions;

    // Start with default Idle animation
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

  // Compute model bounding box and calibrate realistic PBR material properties with customization
  useEffect(() => {
    if (!avatarGLTF.scene) return;

    // 1. Compute exact anatomical bounding box metrics
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

    // 2. Enhance PBR material fidelity across meshes (skin, cornea, hair, fabric)
    avatarGLTF.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const meshName = (mesh.name || '').toLowerCase();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        // Hairstyle visibility toggle according to supported assetId
        if (meshName.includes('ponytail') || meshName.includes('short02') || meshName.includes('hair')) {
          if (parsed3DConfig) {
            mesh.visible = parsed3DConfig.hair.assetId !== 'none';
          }
        }

        materials.forEach((m) => {
          if (!m) return;
          const mat = m as THREE.MeshStandardMaterial;
          const name = ((mesh.name || '') + ' ' + (mat.name || '')).toLowerCase();

          // Calibrate realistic roughness, reflectance, and alpha test properties
          if (
            name.includes('hair') ||
            name.includes('ponytail') ||
            name.includes('bob') ||
            name.includes('braid') ||
            name.includes('eyebrow') ||
            name.includes('eyelash') ||
            name.includes('short02') ||
            name.includes('long01')
          ) {
            mat.alphaTest = 0.5;
            mat.depthWrite = true;
            mat.side = THREE.DoubleSide;
            mat.roughness = parsed3DConfig?.hair.roughness ?? 0.54;
            mat.metalness = 0.02;

            // Apply hair color tint if customized
            if (parsed3DConfig && (name.includes('ponytail') || name.includes('short02') || name.includes('hair'))) {
              mat.color.set(safeColor(parsed3DConfig.hair.color, '#2C1B14'));
            }
          } else if (
            name.includes('skin') ||
            name.includes('head') ||
            name.includes('body') ||
            name.includes('human') ||
            name.includes('base')
          ) {
            // Natural human skin: 0.52 roughness with subtle micro-pore scatter
            mat.roughness = parsed3DConfig?.materials.skinRoughness ?? 0.52;
            mat.metalness = 0.0;
            if (mat.normalMap) {
              mat.normalScale = new THREE.Vector2(0.22, 0.22);
            }
            if ('clearcoat' in mat) {
              (mat as THREE.MeshPhysicalMaterial).clearcoat = 0.06;
              (mat as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.4;
              (mat as THREE.MeshPhysicalMaterial).sheen = 0.30;
              (mat as THREE.MeshPhysicalMaterial).sheenRoughness = 0.5;
              (mat as THREE.MeshPhysicalMaterial).sheenColor = new THREE.Color('#ffdfd3');
            }

            // Apply skin tone tint if customized
            if (parsed3DConfig && (mat.name === 'Human.body' || meshName === 'base' || meshName === 'human' || name.includes('skin'))) {
              mat.color.set(safeColor(parsed3DConfig.materials.skinTone, '#E8B590'));
            }
          } else if (name.includes('eye') || name.includes('poly')) {
            // Crystal-clear moist cornea with sharp specular catchlight
            mat.roughness = parsed3DConfig?.materials.eyeRoughness ?? 0.04;
            mat.metalness = 0.0;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true;

            // Apply eye color tint if customized
            if (parsed3DConfig && (mat.name === 'Human.low-poly' || name.includes('eye'))) {
              mat.color.set(safeColor(parsed3DConfig.materials.eyeColor, '#3B2219'));
            }
          } else if (name.includes('teeth')) {
            mat.roughness = parsed3DConfig?.materials.teethRoughness ?? 0.16;
            mat.metalness = 0.0;
          } else if (
            name.includes('outfit') ||
            name.includes('bottom') ||
            name.includes('top') ||
            name.includes('footwear') ||
            name.includes('suit') ||
            name.includes('clothes') ||
            name.includes('elegantsuit') ||
            name.includes('casualsuit')
          ) {
            // Matte tailored fabric finish
            mat.roughness = 0.85;
            mat.metalness = 0.0;

            // Apply outfit color tint if customized
            if (parsed3DConfig && parsed3DConfig.clothing.topColor) {
              mat.color.set(safeColor(parsed3DConfig.clothing.topColor, '#232938'));
            }
          } else if (name.includes('shoes')) {
            mat.roughness = 0.65;
            mat.metalness = 0.0;
          }
          mat.needsUpdate = true;
        });
      }
    });

    return () => {
      // GPU Memory Cleanup: Dispose geometries, textures, and materials when switching models
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

  // 2. Rotate talking animation variants during conversational turns
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

  // 3. Play transitions between animation clips
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

  // 4. Voice State Machine -> Animation Controller
  useEffect(() => {
    if (interactiveReaction) {
      // Temporary user touch reaction overrides voice state
      playAnimation(interactiveReaction as Companion3DAnimation, 0.25);
      return;
    }

    if (state === 'interrupted') {
      // Immediate clean stop of speaking animation
      playAnimation('Idle', 0.15);
      return;
    }

    const targetClip = mapVoiceStateToAnimation(state, talkingVariant);
    playAnimation(targetClip, 0.4);
  }, [state, talkingVariant, interactiveReaction, playAnimation]);

  // 5. Natural Blinking Cycle (140ms duration every 3.2s to 5.5s)
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

  // 6. Interactive Click/Tap Handler (Talking Tom Style)
  const handlePointerDown = (event: { stopPropagation: () => void; object: THREE.Object3D }) => {
    event.stopPropagation();

    // Do not trigger disruptive physical reactions if user is speaking or companion is responding
    if (activeSpeaking || state === 'listening' || state === 'processing_speech') {
      return;
    }

    const meshName = event.object.name || '';
    if (meshName.includes('Head') || meshName.includes('Hair') || meshName.includes('Eye')) {
      // Tapping head triggers laughing / smiling reaction
      setInteractiveReaction('Laughing');
      onTapReaction?.('head');
      setTimeout(() => {
        setInteractiveReaction(null);
      }, 2400);
    } else {
      // Tapping body/torso triggers friendly conversational gesture
      setInteractiveReaction('Talking_1');
      onTapReaction?.('body');
      setTimeout(() => {
        setInteractiveReaction(null);
      }, 2600);
    }
  };

  // 7. Per-frame Morph Target & Lip Sync Update Loop
  useFrame((_, delta) => {
    // A. Update skeletal animation mixer
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    // B. Calculate active viseme & mouth target
    if (activeSpeaking) {
      const { targetName, intensity } = calculateActiveViseme(
        currentTime,
        visemes,
        audioLevel
      );
      currentVisemeTargetRef.current = targetName;
      // Clamp anatomical aperture to natural human maximum (0.52) to avoid unhinged gaping jaw
      const naturalIntensity = Math.min(0.52, intensity * 0.65);
      // Exponential lerp smoothing for organic speech attack/decay
      currentVisemeIntensityRef.current +=
        (naturalIntensity - currentVisemeIntensityRef.current) * 0.4;
    } else {
      currentVisemeTargetRef.current = 'viseme_sil';
      // Accelerated decay when speech stops so the mouth immediately closes to neutral
      currentVisemeIntensityRef.current += (0 - currentVisemeIntensityRef.current) * 0.55;
    }

    // Resting jaw base offset from facial customization (chin length)
    const baseJaw = parsed3DConfig
      ? Math.max(0, ((parsed3DConfig.face.chinLength ?? 0.5) - 0.5) * 0.15)
      : 0;

    // C. Apply morph targets to Head, Teeth, and Eyes
    avatarGLTF.scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.SkinnedMesh;
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        if (dict && influences && influences.length > 0) {
          // 1. Apply Facial Customization Morphs to Base Face Mesh
          if ((mesh.name === 'base' || mesh.name === 'Human' || dict['jawForward'] !== undefined) && parsed3DConfig) {
            // Jaw & Chin Projection
            const jawFwd = dict['jawForward'];
            if (jawFwd !== undefined && influences[jawFwd] !== undefined) {
              influences[jawFwd] = parsed3DConfig.face.jawWidth * 0.7;
            }

            // Cheekbone Height & Fullness
            const cheekSquintL = dict['cheekSquintLeft'];
            const cheekSquintR = dict['cheekSquintRight'];
            if (cheekSquintL !== undefined && cheekSquintR !== undefined) {
              influences[cheekSquintL] = parsed3DConfig.face.cheekboneHeight * 0.65;
              influences[cheekSquintR] = parsed3DConfig.face.cheekboneHeight * 0.65;
            }

            const cheekPuff = dict['cheekPuff'];
            if (cheekPuff !== undefined && influences[cheekPuff] !== undefined) {
              influences[cheekPuff] = (parsed3DConfig.face.cheekboneFullness ?? 0.5) * 0.6;
            }

            // Eyes Size & Aperture
            const eyeWideL = dict['eyeWideLeft'];
            const eyeWideR = dict['eyeWideRight'];
            if (eyeWideL !== undefined && eyeWideR !== undefined) {
              influences[eyeWideL] = parsed3DConfig.face.eyeSize * 0.55;
              influences[eyeWideR] = parsed3DConfig.face.eyeSize * 0.55;
            }

            // Nose Bridge Width
            const noseSneerL = dict['noseSneerLeft'];
            const noseSneerR = dict['noseSneerRight'];
            if (noseSneerL !== undefined && noseSneerR !== undefined) {
              influences[noseSneerL] = parsed3DConfig.face.noseBridgeWidth * 0.45;
              influences[noseSneerR] = parsed3DConfig.face.noseBridgeWidth * 0.45;
            }

            // Lip Fullness & Mouth Width
            const mouthRollUp = dict['mouthRollUpper'];
            const mouthRollLo = dict['mouthRollLower'];
            if (mouthRollUp !== undefined && mouthRollLo !== undefined) {
              influences[mouthRollUp] = parsed3DConfig.face.lipFullnessUpper * 0.6;
              influences[mouthRollLo] = parsed3DConfig.face.lipFullnessLower * 0.6;
            }

            const mouthStretchL = dict['mouthStretchLeft'];
            const mouthStretchR = dict['mouthStretchRight'];
            if (mouthStretchL !== undefined && mouthStretchR !== undefined) {
              influences[mouthStretchL] = parsed3DConfig.face.mouthWidth * 0.5;
              influences[mouthStretchR] = parsed3DConfig.face.mouthWidth * 0.5;
            }

            // Demographic contour morphs (chin length & jaw taper)
            const macroCau = dict['$md-$ca-$fe-$yn'];
            if (macroCau !== undefined && influences[macroCau] !== undefined) {
              influences[macroCau] = parsed3DConfig.face.chinLength * 0.5;
            }
          }

          // 2. Blinking morph targets (operates independently over eyeWide)
          const blinkIdxL = dict['eyeBlinkLeft'];
          const blinkIdxR = dict['eyeBlinkRight'];
          if (
            blinkIdxL !== undefined &&
            blinkIdxR !== undefined &&
            influences[blinkIdxL] !== undefined &&
            influences[blinkIdxR] !== undefined
          ) {
            const targetBlink = isBlinkingRef.current ? 1.0 : 0.0;
            influences[blinkIdxL] += (targetBlink - influences[blinkIdxL]!) * 0.45;
            influences[blinkIdxR] += (targetBlink - influences[blinkIdxR]!) * 0.45;
          }

          // 3. Deterministic Viseme & Speech Morph Targets
          // Customization never overwrites speech visemes permanently,
          // and speech visemes smoothly decay back to user's customized resting shape (baseJaw).
          const activeViseme = currentVisemeTargetRef.current;
          const activeIntensity = currentVisemeIntensityRef.current;

          for (const key in dict) {
            if (key.startsWith('viseme_') || key === 'mouthOpen' || key === 'jawOpen') {
              const idx = dict[key];
              if (idx !== undefined && influences[idx] !== undefined) {
                if (key === 'jawOpen') {
                  // Additive combination: speech aperture atop customized base resting jaw
                  const targetJaw = (key === activeViseme && activeSpeaking)
                    ? Math.min(0.52, baseJaw + activeIntensity)
                    : baseJaw;
                  const rate = activeSpeaking ? 0.45 : 0.55;
                  influences[idx] += (targetJaw - influences[idx]!) * rate;
                } else if (key === activeViseme && activeSpeaking) {
                  influences[idx] += (activeIntensity - influences[idx]!) * 0.45;
                } else {
                  // Rapid smooth return to neutral mouth
                  influences[idx] += (0 - influences[idx]!) * (activeSpeaking ? 0.35 : 0.6);
                }
              }
            }
          }

          // 4. Subtle Warm Smile Morph Target (decoupled from wide vowels to prevent distortion)
          const smileLeft = dict['mouthSmileLeft'];
          const smileRight = dict['mouthSmileRight'];
          if (
            smileLeft !== undefined &&
            smileRight !== undefined &&
            influences[smileLeft] !== undefined &&
            influences[smileRight] !== undefined
          ) {
            // Lower smile during speech to prevent unnatural grimace
            const smileTarget = activeSpeaking ? 0.12 : (isListening ? 0.28 : 0.18);
            influences[smileLeft] += (smileTarget - influences[smileLeft]!) * 0.15;
            influences[smileRight] += (smileTarget - influences[smileRight]!) * 0.15;
          }

          // 5. Teeth mouth aperture during speech
          if (mesh.name.toLowerCase().includes('teeth')) {
            const teethJaw = dict['jawOpen'];
            if (teethJaw !== undefined && influences[teethJaw] !== undefined) {
              const teethTarget = activeSpeaking ? activeIntensity * 0.35 : 0;
              influences[teethJaw] += (teethTarget - influences[teethJaw]!) * 0.45;
            }
          }
        }
      }
    });

    // D. Body scaling (height) with anatomical clamping
    if (groupRef.current && parsed3DConfig?.body?.height) {
      const clampedH = THREE.MathUtils.clamp(parsed3DConfig.body.height, 0.85, 1.15);
      groupRef.current.scale.set(clampedH, clampedH, clampedH);
    }

    // E. Subtle Organic Spine Breathing Motion
    if (!reducedMotion && groupRef.current) {
      const time = performance.now() * 0.0018;
      // Very gentle breathing sway (0.012 rad) to avoid whole-body scale distortion
      const spine = groupRef.current.getObjectByName('Spine');
      if (spine) {
        spine.rotation.x = Math.sin(time) * 0.015;
      }
    }
  });

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

// Preload models for immediate smooth display
useGLTF.preload('/models/aria_photorealistic.glb');
useGLTF.preload('/models/marcus_photorealistic.glb');
useGLTF.preload('/models/avatar.glb');
useGLTF.preload('/models/animations.glb');
