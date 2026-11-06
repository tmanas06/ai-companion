/**
 * ThreeSceneManager for Mobile (Expo GL + Three.js).
 * Manages the WebGL context, camera, lighting, GLTF model loading, PBR materials,
 * facial morph target manipulation, speech viseme blending, and GPU disposal.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import {
  Avatar3DConfig,
  DEFAULT_AVATAR_3D_CONFIG,
} from '@ai-companion/shared';

export interface WordAlignment {
  words: string[];
  word_start_times_seconds: number[];
  word_end_times_seconds: number[];
}

export type CameraPreset = 'face' | 'bust' | 'full';

export interface SceneManagerOptions {
  gl: ExpoWebGLRenderingContext;
  config: Avatar3DConfig;
  cameraPreset?: CameraPreset;
  onModelLoaded?: () => void;
  onError?: (err: Error) => void;
}

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeColor(hex: string | undefined, fallback: string): string {
  if (hex && HEX_COLOR_REGEX.test(hex)) return hex;
  return fallback;
}

export class ThreeSceneManager {
  private gl: ExpoWebGLRenderingContext;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rootGroup: THREE.Group;
  private modelScene: THREE.Group | null = null;
  private config: Avatar3DConfig;
  private cameraPreset: CameraPreset = 'face';

  private animationFrameId: number | null = null;
  private isDisposed = false;

  // Speech and animation states
  private activeSpeaking = false;
  private audioLevel = 0;
  private currentVisemeIntensity = 0;
  private isBlinking = false;
  private blinkTimeoutId: NodeJS.Timeout | null = null;
  private wordAlignment: WordAlignment | null = null;

  constructor(options: SceneManagerOptions) {
    this.gl = options.gl;
    this.config = options.config || DEFAULT_AVATAR_3D_CONFIG;
    if (options.cameraPreset) this.cameraPreset = options.cameraPreset;

    const width = this.gl.drawingBufferWidth || 300;
    const height = this.gl.drawingBufferHeight || 400;

    // 1. Initialize Scene and Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 20);
    this.applyCameraPreset(this.cameraPreset);

    // 2. Setup Lighting (Key, Fill, Rim, Ambient)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
    keyLight.position.set(1.5, 2.5, 2.0);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.6);
    fillLight.position.set(-1.5, 1.8, 1.5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xc084fc, 0.5);
    rimLight.position.set(0, 2.2, -2.0);
    this.scene.add(rimLight);

    // 3. Root Group
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // 4. Initialize Three.js WebGLRenderer wrapping Expo GL context
    this.renderer = new THREE.WebGLRenderer({
      canvas: {
        width,
        height,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientHeight: height,
        clientWidth: width,
      } as any,
      context: this.gl,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);

    // 5. Start Render Loop & Blinking Schedule
    this.startBlinkCycle();
    this.startRenderLoop();
  }

  public setConfig(newConfig: Avatar3DConfig) {
    this.config = newConfig;
    this.applyConfigToModel();
  }

  public setCameraPreset(preset: CameraPreset) {
    this.cameraPreset = preset;
    this.applyCameraPreset(preset);
  }

  public setVoiceState(isSpeaking: boolean, audioLevel: number = 0) {
    this.activeSpeaking = isSpeaking;
    this.audioLevel = audioLevel;
  }

  public setWordAlignment(alignment: WordAlignment | null) {
    this.wordAlignment = alignment;
  }

  private applyCameraPreset(preset: CameraPreset) {
    switch (preset) {
      case 'face':
        this.camera.position.set(0, 1.62, 0.65);
        this.camera.lookAt(0, 1.58, 0);
        break;
      case 'bust':
        this.camera.position.set(0, 1.35, 1.25);
        this.camera.lookAt(0, 1.30, 0);
        break;
      case 'full':
        this.camera.position.set(0, 0.95, 2.30);
        this.camera.lookAt(0, 0.90, 0);
        break;
    }
  }

  /**
   * Loads a GLTF/GLB model from an HTTP URL or local bundle.
   */
  public async loadModel(modelUrl: string): Promise<void> {
    if (this.isDisposed) return;

    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          if (this.isDisposed) return;

          // Remove prior model if exists
          if (this.modelScene) {
            this.rootGroup.remove(this.modelScene);
            this.disposeObject(this.modelScene);
          }

          this.modelScene = gltf.scene;
          this.rootGroup.add(this.modelScene);
          this.applyConfigToModel();
          resolve();
        },
        undefined,
        (err) => {
          reject(err);
        }
      );
    });
  }

  /**
   * Applies the Avatar3DConfig PBR materials, body height, and hairstyles.
   */
  private applyConfigToModel() {
    if (!this.modelScene || !this.config) return;

    // A. Apply Body Height Scaling
    const heightScale = THREE.MathUtils.clamp(this.config.body?.height ?? 1.0, 0.85, 1.15);
    this.rootGroup.scale.set(heightScale, heightScale, heightScale);

    // B. Apply Materials and Hairstyle Visibilities
    this.modelScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const meshName = (mesh.name || '').toLowerCase();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        // Hairstyle visibility toggle
        if (meshName.includes('ponytail') || meshName.includes('short02') || meshName.includes('hair')) {
          mesh.visible = this.config.hair.assetId !== 'none';
        }

        mats.forEach((m) => {
          if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
          const mat = m as THREE.MeshStandardMaterial;
          const matName = (mat.name || '').toLowerCase();

          // 1. Skin tone
          if (matName === 'human.body' || meshName === 'human' || meshName === 'base' || matName.includes('skin')) {
            mat.color.set(safeColor(this.config.materials.skinTone, '#E8B590'));
            mat.roughness = this.config.materials.skinRoughness ?? 0.52;
          }

          // 2. Eye color
          if (matName === 'human.low-poly' || matName.includes('eye') || meshName.includes('eye')) {
            mat.color.set(safeColor(this.config.materials.eyeColor, '#3B2219'));
            mat.roughness = this.config.materials.eyeRoughness ?? 0.04;
          }

          // 3. Hair color
          if (matName.includes('ponytail') || matName.includes('short02') || matName.includes('hair') || meshName.includes('hair')) {
            mat.color.set(safeColor(this.config.hair.color, '#2C1B14'));
            mat.roughness = this.config.hair.roughness ?? 0.65;
          }

          // 4. Clothing fabric color
          if (matName.includes('suit') || matName.includes('clothes') || meshName.includes('clothes')) {
            if (this.config.clothing.topColor) {
              mat.color.set(safeColor(this.config.clothing.topColor, '#232938'));
            }
          }
        });
      }
    });
  }

  /**
   * Per-frame animation loop: calculates morph targets and lip sync.
   */
  private updateFrame() {
    if (!this.modelScene || !this.config) return;

    // 1. Calculate speech intensity & mouth aperture
    if (this.activeSpeaking) {
      const targetIntensity = Math.min(0.52, Math.max(0.18, this.audioLevel * 0.7));
      this.currentVisemeIntensity += (targetIntensity - this.currentVisemeIntensity) * 0.45;
    } else {
      // Rapid smooth decay back to neutral
      this.currentVisemeIntensity += (0 - this.currentVisemeIntensity) * 0.55;
    }

    // Customized resting jaw offset based on chinLength
    const baseJaw = Math.max(0, ((this.config.face.chinLength ?? 0.5) - 0.5) * 0.15);

    // 2. Apply facial morph targets to the Human / base skinned mesh
    this.modelScene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.SkinnedMesh;
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        if (dict && influences && (mesh.name === 'base' || mesh.name === 'Human' || dict['jawForward'] !== undefined)) {
          // A. Customization shape keys
          if (dict['jawForward'] !== undefined) influences[dict['jawForward']] = this.config.face.jawWidth * 0.7;
          if (dict['$md-$ca-$fe-$yn'] !== undefined) influences[dict['$md-$ca-$fe-$yn']] = this.config.face.chinLength * 0.5;

          if (dict['cheekSquintLeft'] !== undefined) influences[dict['cheekSquintLeft']] = this.config.face.cheekboneHeight * 0.65;
          if (dict['cheekSquintRight'] !== undefined) influences[dict['cheekSquintRight']] = this.config.face.cheekboneHeight * 0.65;
          if (dict['cheekPuff'] !== undefined) influences[dict['cheekPuff']] = (this.config.face.cheekboneFullness ?? 0.5) * 0.6;

          if (dict['eyeWideLeft'] !== undefined) influences[dict['eyeWideLeft']] = this.config.face.eyeSize * 0.55;
          if (dict['eyeWideRight'] !== undefined) influences[dict['eyeWideRight']] = this.config.face.eyeSize * 0.55;

          if (dict['noseSneerLeft'] !== undefined) influences[dict['noseSneerLeft']] = this.config.face.noseBridgeWidth * 0.45;
          if (dict['noseSneerRight'] !== undefined) influences[dict['noseSneerRight']] = this.config.face.noseBridgeWidth * 0.45;

          if (dict['mouthRollUpper'] !== undefined) influences[dict['mouthRollUpper']] = this.config.face.lipFullnessUpper * 0.6;
          if (dict['mouthRollLower'] !== undefined) influences[dict['mouthRollLower']] = this.config.face.lipFullnessLower * 0.6;

          if (dict['mouthStretchLeft'] !== undefined) influences[dict['mouthStretchLeft']] = this.config.face.mouthWidth * 0.5;
          if (dict['mouthStretchRight'] !== undefined) influences[dict['mouthStretchRight']] = this.config.face.mouthWidth * 0.5;

          // B. Blinking loop (independent from eye size)
          const targetBlink = this.isBlinking ? 1.0 : 0.0;
          const blinkL = dict['eyeBlinkLeft'];
          if (blinkL !== undefined && influences[blinkL] !== undefined) {
            influences[blinkL] = (influences[blinkL] || 0) + (targetBlink - (influences[blinkL] || 0)) * 0.45;
          }
          const blinkR = dict['eyeBlinkRight'];
          if (blinkR !== undefined && influences[blinkR] !== undefined) {
            influences[blinkR] = (influences[blinkR] || 0) + (targetBlink - (influences[blinkR] || 0)) * 0.45;
          }

          // C. Lip sync & Speech aperture (additive combination over resting baseJaw)
          const targetJaw = this.activeSpeaking ? Math.min(0.52, baseJaw + this.currentVisemeIntensity) : baseJaw;
          const jawOpenIdx = dict['jawOpen'];
          if (jawOpenIdx !== undefined && influences[jawOpenIdx] !== undefined) {
            influences[jawOpenIdx] = (influences[jawOpenIdx] || 0) + (targetJaw - (influences[jawOpenIdx] || 0)) * 0.5;
          }
          const visemeIdx = dict['viseme_aa'];
          if (visemeIdx !== undefined && influences[visemeIdx] !== undefined) {
            influences[visemeIdx] = (influences[visemeIdx] || 0) + (this.currentVisemeIntensity * 0.7 - (influences[visemeIdx] || 0)) * 0.45;
          }
          const mouthOpenIdx = dict['mouthOpen'];
          if (mouthOpenIdx !== undefined && influences[mouthOpenIdx] !== undefined) {
            influences[mouthOpenIdx] = (influences[mouthOpenIdx] || 0) + (this.currentVisemeIntensity * 0.5 - (influences[mouthOpenIdx] || 0)) * 0.45;
          }
        }

        // D. Teeth mouth opening
        if (dict && influences && mesh.name.toLowerCase().includes('teeth')) {
          if (dict['jawOpen'] !== undefined) {
            influences[dict['jawOpen']] = this.activeSpeaking ? this.currentVisemeIntensity * 0.35 : 0;
          }
        }
      }
    });
  }

  private startBlinkCycle() {
    const scheduleNext = () => {
      if (this.isDisposed) return;
      const delay = 3200 + Math.random() * 2500;
      this.blinkTimeoutId = setTimeout(() => {
        if (this.isDisposed) return;
        this.isBlinking = true;
        setTimeout(() => {
          if (this.isDisposed) return;
          this.isBlinking = false;
          scheduleNext();
        }, 140);
      }, delay);
    };
    scheduleNext();
  }

  private startRenderLoop() {
    const loop = () => {
      if (this.isDisposed) return;
      this.animationFrameId = requestAnimationFrame(loop);
      this.updateFrame();
      this.renderer.render(this.scene, this.camera);
      this.gl.endFrameEXP();
    };
    loop();
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
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
  }

  public dispose() {
    this.isDisposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.blinkTimeoutId !== null) {
      clearTimeout(this.blinkTimeoutId);
      this.blinkTimeoutId = null;
    }
    if (this.modelScene) {
      this.disposeObject(this.modelScene);
      this.modelScene = null;
    }
    this.renderer.dispose();
  }
}
