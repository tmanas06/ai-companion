import {
  mapVoiceStateToAnimation,
  calculateActiveViseme,
  clampCameraDistance,
  getDefaultCameraFraming,
  deriveFramingFromMetrics,
  calculateDynamicLookAt,
  CAMERA_ZOOM_LIMITS,
  VISEME_TO_MORPH_TARGET_MAP,
} from './animation-mappings';
import { VisemeCue } from '../AvatarRenderer';

describe('3D Animation and Viseme Mappings', () => {
  describe('mapVoiceStateToAnimation', () => {
    it('maps idle and attentive voice states to Idle animation', () => {
      expect(mapVoiceStateToAnimation('idle')).toBe('Idle');
      expect(mapVoiceStateToAnimation('listening')).toBe('Idle');
      expect(mapVoiceStateToAnimation('processing_speech')).toBe('Idle');
      expect(mapVoiceStateToAnimation('generating_response')).toBe('Idle');
    });

    it('maps speaking state to Talking variants', () => {
      expect(mapVoiceStateToAnimation('speaking', 0)).toBe('Talking_0');
      expect(mapVoiceStateToAnimation('speaking', 1)).toBe('Talking_1');
      expect(mapVoiceStateToAnimation('speaking', 2)).toBe('Talking_2');
    });

    it('immediately maps interrupted and error states back to Idle', () => {
      expect(mapVoiceStateToAnimation('interrupted')).toBe('Idle');
      expect(mapVoiceStateToAnimation('error')).toBe('Idle');
    });
  });

  describe('calculateActiveViseme', () => {
    const sampleCues: VisemeCue[] = [
      { start: 0.0, end: 0.5, viseme: 'D' },
      { start: 0.5, end: 1.0, viseme: 'A' },
      { start: 1.0, end: 1.5, viseme: 'X' },
    ];

    it('resolves active viseme from timestamp cues', () => {
      const res1 = calculateActiveViseme(0.25, sampleCues, 0);
      expect(res1.targetName).toBe('viseme_aa');
      expect(res1.intensity).toBeGreaterThan(0.5);

      const res2 = calculateActiveViseme(0.75, sampleCues, 0);
      expect(res2.targetName).toBe('viseme_PP');

      const res3 = calculateActiveViseme(1.25, sampleCues, 0);
      expect(res3.targetName).toBe('viseme_sil');
      expect(res3.intensity).toBe(0);
    });

    it('falls back to amplitude envelope when no viseme cues are provided', () => {
      // High volume
      const loud = calculateActiveViseme(undefined, undefined, 0.7);
      expect(loud.targetName).toBe('viseme_aa');
      expect(loud.intensity).toBeGreaterThan(0.8);

      // Mid volume
      const mid = calculateActiveViseme(undefined, undefined, 0.35);
      expect(mid.targetName).toBe('viseme_O');

      // Silence
      const silent = calculateActiveViseme(undefined, undefined, 0.01);
      expect(silent.targetName).toBe('viseme_sil');
      expect(silent.intensity).toBe(0);
    });

    it('maps all Preston Blair viseme codes accurately', () => {
      expect(VISEME_TO_MORPH_TARGET_MAP['X']).toBe('viseme_sil');
      expect(VISEME_TO_MORPH_TARGET_MAP['A']).toBe('viseme_PP');
      expect(VISEME_TO_MORPH_TARGET_MAP['B']).toBe('viseme_kk');
      expect(VISEME_TO_MORPH_TARGET_MAP['C']).toBe('viseme_I');
      expect(VISEME_TO_MORPH_TARGET_MAP['D']).toBe('viseme_aa');
      expect(VISEME_TO_MORPH_TARGET_MAP['E']).toBe('viseme_O');
      expect(VISEME_TO_MORPH_TARGET_MAP['F']).toBe('viseme_U');
      expect(VISEME_TO_MORPH_TARGET_MAP['G']).toBe('viseme_FF');
      expect(VISEME_TO_MORPH_TARGET_MAP['H']).toBe('viseme_TH');
    });
  });

  describe('clampCameraDistance', () => {
    it('enforces minimum zoom distance to prevent clipping character', () => {
      expect(clampCameraDistance(0.5)).toBe(CAMERA_ZOOM_LIMITS.MIN_DISTANCE);
      expect(clampCameraDistance(0.2)).toBe(CAMERA_ZOOM_LIMITS.MIN_DISTANCE);
    });

    it('enforces maximum zoom distance to prevent character loss', () => {
      expect(clampCameraDistance(10.0)).toBe(CAMERA_ZOOM_LIMITS.MAX_DISTANCE);
      expect(clampCameraDistance(5.5)).toBe(CAMERA_ZOOM_LIMITS.MAX_DISTANCE);
    });

    it('preserves distances within bounds', () => {
      expect(clampCameraDistance(2.5)).toBe(2.5);
      expect(clampCameraDistance(1.5)).toBe(1.5);
    });
  });

  describe('getDefaultCameraFraming', () => {
    it('returns valid full-body framing coordinates', () => {
      const framing = getDefaultCameraFraming();
      expect(framing.distance).toBe(CAMERA_ZOOM_LIMITS.DEFAULT_DISTANCE);
      expect(framing.targetY).toBe(CAMERA_ZOOM_LIMITS.DEFAULT_TARGET_Y);
      expect(framing.cameraY).toBe(CAMERA_ZOOM_LIMITS.DEFAULT_CAMERA_Y);
    });
  });

  describe('deriveFramingFromMetrics & calculateDynamicLookAt', () => {
    const mockMetrics = {
      min: [-0.46, 0.0, -0.15] as [number, number, number],
      max: [0.46, 1.77, 0.19] as [number, number, number],
      size: [0.92, 1.77, 0.34] as [number, number, number],
      center: [0, 0.88, 0] as [number, number, number],
      height: 1.77,
      headY: 1.63,
      eyeY: 1.67,
      chestY: 1.23,
      pelvisY: 0.88,
    };

    it('derives close-up face framing accurately', () => {
      const framing = deriveFramingFromMetrics(mockMetrics, 'face');
      expect(framing.distance).toBe(0.75);
      expect(framing.targetY).toBeCloseTo(1.65);
      expect(framing.cameraY).toBe(1.67);
    });

    it('derives upper body bust framing accurately', () => {
      const framing = deriveFramingFromMetrics(mockMetrics, 'upper');
      expect(framing.distance).toBe(1.45);
      expect(framing.targetY).toBe(1.23);
    });

    it('derives full body framing with comfortable margins', () => {
      const framing = deriveFramingFromMetrics(mockMetrics, 'full', 34, 1.9);
      expect(framing.distance).toBe(3.2);
      expect(framing.targetY).toBeCloseTo(0.92);
    });

    it('glides look-at target between head and center based on distance', () => {
      const closeLook = calculateDynamicLookAt(0.75, mockMetrics);
      expect(closeLook.targetY).toBeCloseTo(1.65);

      const farLook = calculateDynamicLookAt(3.2, mockMetrics);
      expect(farLook.targetY).toBeCloseTo(0.92);
    });
  });
});
