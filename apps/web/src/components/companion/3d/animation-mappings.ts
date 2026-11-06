import { CompanionVoiceState, VisemeCue, VisemeType } from '../AvatarRenderer';

export type Companion3DAnimation =
  | 'Idle'
  | 'Talking_0'
  | 'Talking_1'
  | 'Talking_2'
  | 'Laughing'
  | 'Crying'
  | 'Angry'
  | 'Terrified'
  | 'Rumba';

export type CameraFramingPreset = 'face' | 'upper' | 'full';

export interface ModelBoundingMetrics {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
  height: number;
  headY: number;
  eyeY: number;
  chestY: number;
  pelvisY: number;
}

export interface CameraFramingState {
  distance: number;
  targetY: number;
  cameraY: number;
}

export const CAMERA_ZOOM_LIMITS = {
  MIN_DISTANCE: 0.65, // Close-up on face without clipping through mesh
  MAX_DISTANCE: 4.8,  // Wide room framing
  DEFAULT_DISTANCE: 3.2, // Full-body head-to-toe default framing
  DEFAULT_TARGET_Y: 0.92, // Natural anatomical center of mass
  DEFAULT_CAMERA_Y: 1.04, // Slightly elevated portrait perspective
  DEFAULT_FOV: 34,        // Flattering portrait lens FOV (minimizes perspective distortion)
  ZOOM_STEP: 0.35,
} as const;

/**
 * Maps companion voice state to suitable rigged skeletal animation clip.
 */
export function mapVoiceStateToAnimation(
  state: CompanionVoiceState,
  talkingVariant: 0 | 1 | 2 = 0
): Companion3DAnimation {
  switch (state) {
    case 'speaking':
      if (talkingVariant === 1) return 'Talking_1';
      if (talkingVariant === 2) return 'Talking_2';
      return 'Talking_0';

    case 'listening':
    case 'processing_speech':
    case 'generating_response':
    case 'idle':
    case 'requesting_microphone':
    case 'interrupted':
    case 'error':
    default:
      return 'Idle';
  }
}

/**
 * Maps Preston Blair viseme codes (from audio pipeline) to ReadyPlayerMe ARKit/Oculus morph targets.
 */
export const VISEME_TO_MORPH_TARGET_MAP: Record<VisemeType, string> = {
  X: 'viseme_sil', // Rest/silence
  A: 'viseme_PP',  // Bilabial (/p/, /b/, /m/)
  B: 'viseme_kk',  // Plosive / velar (/k/, /g/, /d/, /t/)
  C: 'viseme_I',   // High front vowel (/ee/, /ih/)
  D: 'viseme_aa',  // Wide open vowel (/aa/, /ah/, /ae/)
  E: 'viseme_O',   // Mid rounded vowel (/oh/, /er/)
  F: 'viseme_U',   // Puckered rounded vowel (/oo/, /w/)
  G: 'viseme_FF',  // Labiodental fricative (/f/, /v/)
  H: 'viseme_TH',  // Dental fricative (/th/, /l/)
};

/**
 * Calculates active viseme morph target and intensity based on timed cues or audio envelope fallback.
 */
export function calculateActiveViseme(
  currentTime?: number,
  visemes?: VisemeCue[],
  audioLevel: number = 0
): { targetName: string; intensity: number } {
  if (visemes && visemes.length > 0 && typeof currentTime === 'number') {
    const activeCue = visemes.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end
    );
    if (activeCue && activeCue.viseme !== 'X') {
      const targetName = VISEME_TO_MORPH_TARGET_MAP[activeCue.viseme] || 'viseme_aa';
      return { targetName, intensity: 0.85 };
    }
    return { targetName: 'viseme_sil', intensity: 0.0 };
  }

  // Fallback: Real-time audio amplitude envelope
  if (audioLevel > 0.04) {
    const intensity = Math.min(1.0, audioLevel * 1.6);
    // Cycle through open vowel shapes based on intensity
    const targetName = intensity > 0.6 ? 'viseme_aa' : intensity > 0.3 ? 'viseme_O' : 'viseme_E';
    return { targetName, intensity };
  }

  return { targetName: 'viseme_sil', intensity: 0.0 };
}

/**
 * Clamps camera distance within safe limits to prevent clipping.
 */
export function clampCameraDistance(distance: number): number {
  return Math.max(
    CAMERA_ZOOM_LIMITS.MIN_DISTANCE,
    Math.min(CAMERA_ZOOM_LIMITS.MAX_DISTANCE, distance)
  );
}

/**
 * Returns default full-body camera framing.
 */
export function getDefaultCameraFraming(): CameraFramingState {
  return {
    distance: CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE,
    targetY: CAMERA_ZOOM_LIMITS.DEFAULT_TARGET_Y,
    cameraY: CAMERA_ZOOM_LIMITS.DEFAULT_CAMERA_Y,
  };
}

/**
 * Calculates camera distance and look-at target derived directly from model bounding metrics.
 */
export function deriveFramingFromMetrics(
  metrics: ModelBoundingMetrics | null,
  preset: CameraFramingPreset,
  _fovDegrees: number = CAMERA_ZOOM_LIMITS.DEFAULT_FOV,
  _aspectRatio: number = 1.0
): CameraFramingState {
  if (!metrics) {
    if (preset === 'face') {
      return { distance: 0.85, targetY: 1.58, cameraY: 1.62 };
    }
    if (preset === 'upper') {
      return { distance: 1.45, targetY: 1.25, cameraY: 1.30 };
    }
    return getDefaultCameraFraming();
  }

  const { headY, eyeY, chestY, center } = metrics;

  if (preset === 'face') {
    return {
      distance: 0.75,
      targetY: headY + 0.02,
      cameraY: eyeY,
    };
  }

  if (preset === 'upper') {
    return {
      distance: 1.45,
      targetY: chestY,
      cameraY: chestY + 0.05,
    };
  }

  // Full-body framing: head-to-toe with balanced vertical centering
  return {
    distance: 3.2,
    targetY: center[1] + 0.04,
    cameraY: center[1] + 0.16,
  };
}

/**
 * Dynamically computes targetY and cameraY smoothly based on current zoom distance.
 * When zooming in close, look-at smoothly glides up to the face.
 * When zooming out wide, look-at smoothly glides down to the full body center.
 */
export function calculateDynamicLookAt(
  currentDistance: number,
  metrics: ModelBoundingMetrics | null
): { targetY: number; cameraY: number } {
  const headTargetY = metrics ? metrics.headY + 0.02 : 1.65;
  const eyeCameraY = metrics ? metrics.eyeY : 1.67;
  const fullTargetY = metrics ? metrics.center[1] + 0.04 : 0.92;
  const fullCameraY = metrics ? metrics.center[1] + 0.16 : 1.04;

  // t = 0 at close-up (0.75m), t = 1 at full-body (3.2m)
  const t = Math.max(0, Math.min(1, (currentDistance - 0.75) / (3.2 - 0.75)));
  const targetY = headTargetY + (fullTargetY - headTargetY) * t;
  const cameraY = eyeCameraY + (fullCameraY - eyeCameraY) * t;

  return { targetY, cameraY };
}
