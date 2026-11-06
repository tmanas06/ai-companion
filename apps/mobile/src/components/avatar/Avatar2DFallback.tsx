/**
 * Avatar2DFallback Component.
 * High-fidelity 2D representation of the companion that honors Avatar3DConfig.
 * Used as a zero-dependency, crash-proof presentation fallback whenever WebGL or 3D GLB fails.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Avatar3DConfig, DEFAULT_AVATAR_3D_CONFIG } from '@ai-companion/shared';

export interface Avatar2DFallbackProps {
  config?: Avatar3DConfig;
  isSpeaking?: boolean;
  isListening?: boolean;
  audioLevel?: number;
  reason?: string;
  testID?: string;
}

export function Avatar2DFallback({
  config = DEFAULT_AVATAR_3D_CONFIG,
  isSpeaking = false,
  isListening = false,
  audioLevel = 0,
  reason,
  testID = 'avatar-2d-fallback',
}: Avatar2DFallbackProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mouthAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation when companion is speaking
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isSpeaking) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.96,
            duration: 200,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      Animated.spring(pulseAnim, {
        toValue: 1.0,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      animation?.stop();
    };
  }, [isSpeaking, pulseAnim]);

  // Speech mouth animation
  useEffect(() => {
    if (isSpeaking) {
      Animated.spring(mouthAnim, {
        toValue: Math.max(0.4, Math.min(1.0, (audioLevel || 0.5) * 1.5)),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(mouthAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: false,
      }).start();
    }
  }, [isSpeaking, audioLevel, mouthAnim]);

  const skinColor = config.materials?.skinTone || '#E8B590';
  const hairColor = config.hair?.color || '#2C1B14';
  const eyeColor = config.materials?.eyeColor || '#3B2219';
  const clothingColor = config.clothing?.topColor || '#232938';
  const isMale =
    config.baseModelId === 'marcus_photorealistic' ||
    config.baseModelId === 'human_male_v1';
  const hasHair = config.hair?.assetId !== 'none';

  // Morph targets influences on 2D geometry
  const jawScale = 0.85 + (config.face?.jawWidth ?? 0.5) * 0.3;
  const eyeScale = 0.8 + (config.face?.eyeSize ?? 0.5) * 0.4;
  const mouthWidthScale = 0.8 + (config.face?.mouthWidth ?? 0.5) * 0.4;

  return (
    <View style={styles.container} testID={testID}>
      {reason ? (
        <View style={styles.fallbackNotice}>
          <Text style={styles.fallbackNoticeText}>2D Companion Mode ({reason})</Text>
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.avatarStage,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Glow Aura when speaking */}
        {isSpeaking && <View style={styles.speakingAura} />}

        {/* Head / Hair Root */}
        <View style={styles.headContainer}>
          {/* Hair Top / Bun / Ponytail */}
          {hasHair && (
            <View
              style={[
                styles.hairTop,
                {
                  backgroundColor: hairColor,
                  borderTopLeftRadius: isMale ? 30 : 50,
                  borderTopRightRadius: isMale ? 30 : 50,
                },
              ]}
            />
          )}

          {/* Face Base */}
          <View
            style={[
              styles.face,
              {
                backgroundColor: skinColor,
                transform: [{ scaleX: jawScale }],
              },
            ]}
          >
            {/* Eyes Row */}
            <View style={styles.eyesRow}>
              {/* Left Eye */}
              <View
                style={[
                  styles.eyeOuter,
                  {
                    transform: [{ scale: eyeScale }],
                  },
                ]}
              >
                <View style={[styles.eyeIris, { backgroundColor: eyeColor }]}>
                  <View style={styles.eyePupil} />
                </View>
              </View>

              {/* Right Eye */}
              <View
                style={[
                  styles.eyeOuter,
                  {
                    transform: [{ scale: eyeScale }],
                  },
                ]}
              >
                <View style={[styles.eyeIris, { backgroundColor: eyeColor }]}>
                  <View style={styles.eyePupil} />
                </View>
              </View>
            </View>

            {/* Nose Bridge */}
            <View style={[styles.nose, { backgroundColor: '#00000015' }]} />

            {/* Mouth */}
            <Animated.View
              style={[
                styles.mouth,
                {
                  transform: [{ scaleX: mouthWidthScale }],
                  height: mouthAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [4, 18],
                  }),
                  borderRadius: mouthAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2, 9],
                  }),
                  backgroundColor: isSpeaking ? '#881337' : '#9f1239',
                },
              ]}
            />
          </View>
        </View>

        {/* Shoulders & Clothing */}
        <View style={[styles.body, { backgroundColor: clothingColor }]}>
          <View style={[styles.collar, { backgroundColor: skinColor }]} />
        </View>
      </Animated.View>

      {/* Voice State Badge */}
      <View style={styles.statusBadge}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isSpeaking
                ? '#10b981'
                : isListening
                ? '#3b82f6'
                : '#94a3b8',
            },
          ]}
        />
        <Text style={styles.statusText}>
          {isSpeaking
            ? 'Speaking...'
            : isListening
            ? 'Listening...'
            : 'Idle'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackNotice: {
    position: 'absolute',
    top: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  fallbackNoticeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  avatarStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakingAura: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  headContainer: {
    alignItems: 'center',
    zIndex: 2,
  },
  hairTop: {
    width: 140,
    height: 60,
    marginBottom: -24,
    zIndex: 1,
  },
  face: {
    width: 120,
    height: 140,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  eyesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 72,
    marginBottom: 10,
  },
  eyeOuter: {
    width: 24,
    height: 18,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIris: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#000000',
  },
  nose: {
    width: 6,
    height: 14,
    borderRadius: 3,
    marginBottom: 8,
  },
  mouth: {
    width: 32,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  body: {
    width: 220,
    height: 90,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    marginTop: -20,
    alignItems: 'center',
    zIndex: 1,
  },
  collar: {
    width: 44,
    height: 24,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
});
