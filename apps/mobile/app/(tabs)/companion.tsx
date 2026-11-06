/**
 * Mobile Avatar Studio Screen.
 * Full mobile customization studio matching the web Avatar Studio controls:
 * - 3D live viewport with camera controls and test speech
 * - Facial morphs (Jaw, Chin, Cheekbones, Eyes, Nose, Lips, Mouth)
 * - Skin tone and eye color palettes
 * - Modular hairstyles and hair colors
 * - Wardrobe styles, fabric finishes, and body height scaling
 * - Cloud persistence via FastAPI backend and authenticated storage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {
  Avatar3DConfig,
  DEFAULT_AVATAR_3D_CONFIG,
  SupportedBaseModelId,
  SupportedHairAssetId,
  SupportedClothingAssetId,
} from '@ai-companion/shared';
import { MobileAvatarRenderer } from '../../src/components/avatar/MobileAvatarRenderer';
import { CameraPreset } from '../../src/components/avatar/ThreeSceneManager';
import {
  getActiveAvatar,
  saveAvatar,
} from '../../src/services/avatar-service';

// --- Preset Constants matching Web Studio ---
const SKIN_TONE_PRESETS = [
  { name: 'Light Warm', hex: '#F5D0B5' },
  { name: 'Fair Peachy', hex: '#E8B590' },
  { name: 'Golden Olive', hex: '#C68A5C' },
  { name: 'Warm Chestnut', hex: '#9E6B47' },
  { name: 'Deep Espresso', hex: '#6E4123' },
  { name: 'Rich Cocoa', hex: '#3C2212' },
];

const EYE_COLOR_PRESETS = [
  { name: 'Hazel Brown', hex: '#3B2219' },
  { name: 'Forest Green', hex: '#2B5E3B' },
  { name: 'Ocean Blue', hex: '#2A4B7C' },
  { name: 'Amber Gold', hex: '#6B5B3E' },
  { name: 'Midnight', hex: '#1A1A1A' },
  { name: 'Warm Walnut', hex: '#4A3525' },
];

const HAIR_COLOR_PRESETS = [
  { name: 'Espresso Black', hex: '#1A1A1A' },
  { name: 'Dark Chestnut', hex: '#2C1B14' },
  { name: 'Warm Mocha', hex: '#4A2E18' },
  { name: 'Golden Honey', hex: '#B59A57' },
  { name: 'Copper Auburn', hex: '#8C3B1C' },
  { name: 'Silver Smoke', hex: '#8A8A8A' },
];

const OUTFIT_COLOR_PRESETS = [
  { name: 'Midnight Navy', hex: '#232938' },
  { name: 'Charcoal Noir', hex: '#1C1E24' },
  { name: 'Burgundy Wine', hex: '#4A1521' },
  { name: 'Emerald Pine', hex: '#1B3B2B' },
  { name: 'Camel Warm', hex: '#9E7E56' },
  { name: 'Alabaster Crisp', hex: '#D6CEBA' },
];

type StudioTab = 'face' | 'skin_eyes' | 'hair' | 'body_outfit';

export default function CompanionStudioScreen() {
  const [config, setConfig] = useState<Avatar3DConfig>(DEFAULT_AVATAR_3D_CONFIG);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState<string>('My Companion');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('face');
  const [activeTab, setActiveTab] = useState<StudioTab>('face');

  const [isLoadingAvatar, setIsLoadingAvatar] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTestSpeaking, setIsTestSpeaking] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  // 1. Load active avatar from authenticated API on mount
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoadingAvatar(true);
      const res = await getActiveAvatar();
      if (isMounted) {
        if (res.avatar) {
          setAvatarId(res.avatar.id);
          setAvatarName(res.avatar.name);
          setConfig(res.avatar.config);
        }
        setIsLoadingAvatar(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Save avatar configuration
  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    const res = await saveAvatar(avatarName, config, avatarId);
    setIsSaving(false);

    if (res.avatar) {
      setAvatarId(res.avatar.id);
      setFeedback({ message: 'Avatar saved successfully!', type: 'success' });
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback({
        message: res.error || 'Failed to save avatar',
        type: 'error',
      });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 3. Reset to defaults
  const handleReset = () => {
    Alert.alert(
      'Reset Avatar',
      'Are you sure you want to reset all customizations to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setConfig(DEFAULT_AVATAR_3D_CONFIG);
            setFeedback({ message: 'Reset to default configuration', type: 'success' });
            setTimeout(() => setFeedback(null), 2500);
          },
        },
      ]
    );
  };

  // Helper for face morph adjustments
  const updateFaceMorph = useCallback((field: keyof Avatar3DConfig['face'], value: number) => {
    setConfig((prev) => ({
      ...prev,
      face: {
        ...prev.face,
        [field]: value,
      },
    }));
  }, []);

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="light-content" />

      {/* Top Action Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Avatar Studio</Text>
          <Text style={styles.screenSubtitle}>
            {config.baseModelId === 'marcus_photorealistic' ? 'Marcus' : 'Aria'} 3D
          </Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            disabled={isSaving || isLoadingAvatar}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveButton,
              (isSaving || isLoadingAvatar) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving || isLoadingAvatar}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Feedback Toast */}
      {feedback && (
        <View
          style={[
            styles.feedbackBanner,
            feedback.type === 'success'
              ? styles.feedbackSuccess
              : styles.feedbackError,
          ]}
        >
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      )}

      {/* 3D Viewport Area */}
      <View style={styles.viewportContainer}>
        <MobileAvatarRenderer
          config={config}
          cameraPreset={cameraPreset}
          isSpeaking={isTestSpeaking}
          audioLevel={isTestSpeaking ? 0.65 : 0}
        />

        {/* Viewport Overlay Controls */}
        <View style={styles.viewportControls}>
          {/* Base Model Switcher */}
          <View style={styles.modelSwitcher}>
            <TouchableOpacity
              style={[
                styles.modelChip,
                config.baseModelId === 'aria_photorealistic' && styles.modelChipActive,
              ]}
              onPress={() =>
                setConfig((prev) => ({
                  ...prev,
                  baseModelId: 'aria_photorealistic' as SupportedBaseModelId,
                }))
              }
            >
              <Text
                style={[
                  styles.modelChipText,
                  config.baseModelId === 'aria_photorealistic' &&
                    styles.modelChipTextActive,
                ]}
              >
                Aria
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modelChip,
                config.baseModelId === 'marcus_photorealistic' && styles.modelChipActive,
              ]}
              onPress={() =>
                setConfig((prev) => ({
                  ...prev,
                  baseModelId: 'marcus_photorealistic' as SupportedBaseModelId,
                }))
              }
            >
              <Text
                style={[
                  styles.modelChipText,
                  config.baseModelId === 'marcus_photorealistic' &&
                    styles.modelChipTextActive,
                ]}
              >
                Marcus
              </Text>
            </TouchableOpacity>
          </View>

          {/* Camera Presets & Test Speech */}
          <View style={styles.cameraRow}>
            {(['face', 'bust', 'full'] as CameraPreset[]).map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetChip,
                  cameraPreset === preset && styles.presetChipActive,
                ]}
                onPress={() => setCameraPreset(preset)}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    cameraPreset === preset && styles.presetChipTextActive,
                  ]}
                >
                  {preset.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Test Voice Animation Toggle */}
            <TouchableOpacity
              style={[
                styles.testSpeechChip,
                isTestSpeaking && styles.testSpeechChipActive,
              ]}
              onPress={() => setIsTestSpeaking((prev) => !prev)}
            >
              <Text
                style={[
                  styles.testSpeechChipText,
                  isTestSpeaking && styles.testSpeechChipTextActive,
                ]}
              >
                {isTestSpeaking ? 'Speaking...' : 'Test Voice'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs Navigation */}
      <View style={styles.tabsContainer}>
        {(
          [
            { id: 'face', label: 'Face' },
            { id: 'skin_eyes', label: 'Skin & Eyes' },
            { id: 'hair', label: 'Hair' },
            { id: 'body_outfit', label: 'Wardrobe' },
          ] as { id: StudioTab; label: string }[]
        ).map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabButton, activeTab === t.id && styles.tabButtonActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === t.id && styles.tabButtonTextActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Customization Sliders & Selectors */}
      <ScrollView
        style={styles.controlsScroll}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TAB 1: FACIAL MORPHS */}
        {activeTab === 'face' && (
          <View style={styles.section}>
            {/* Jaw Width */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Jawline Width</Text>
                <Text style={styles.sliderValue}>{config.face.jawWidth.toFixed(2)}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.jawWidth}
                onValueChange={(v) => updateFaceMorph('jawWidth', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Chin Length */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Chin Length</Text>
                <Text style={styles.sliderValue}>{config.face.chinLength.toFixed(2)}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.chinLength}
                onValueChange={(v) => updateFaceMorph('chinLength', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Cheekbone Height */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Cheekbone Prominence</Text>
                <Text style={styles.sliderValue}>
                  {config.face.cheekboneHeight.toFixed(2)}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.cheekboneHeight}
                onValueChange={(v) => updateFaceMorph('cheekboneHeight', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Cheekbone Fullness */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Cheek Fullness</Text>
                <Text style={styles.sliderValue}>
                  {(config.face.cheekboneFullness ?? 0.5).toFixed(2)}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.cheekboneFullness ?? 0.5}
                onValueChange={(v) => updateFaceMorph('cheekboneFullness', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Eye Size */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Eye Size & Aperture</Text>
                <Text style={styles.sliderValue}>{config.face.eyeSize.toFixed(2)}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.eyeSize}
                onValueChange={(v) => updateFaceMorph('eyeSize', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Nose Bridge */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Nose Bridge Width</Text>
                <Text style={styles.sliderValue}>
                  {config.face.noseBridgeWidth.toFixed(2)}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.noseBridgeWidth}
                onValueChange={(v) => updateFaceMorph('noseBridgeWidth', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Lip Fullness */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Lip Fullness</Text>
                <Text style={styles.sliderValue}>
                  {config.face.lipFullnessUpper.toFixed(2)}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.lipFullnessUpper}
                onValueChange={(v) => {
                  updateFaceMorph('lipFullnessUpper', v);
                  updateFaceMorph('lipFullnessLower', v);
                }}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>

            {/* Mouth Width */}
            <View style={styles.sliderGroup}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Mouth Width</Text>
                <Text style={styles.sliderValue}>
                  {config.face.mouthWidth.toFixed(2)}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={config.face.mouthWidth}
                onValueChange={(v) => updateFaceMorph('mouthWidth', v)}
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>
          </View>
        )}

        {/* TAB 2: SKIN & EYES PALETTES */}
        {activeTab === 'skin_eyes' && (
          <View style={styles.section}>
            <Text style={styles.paletteTitle}>Skin Tone Presets (PBR Albedo)</Text>
            <View style={styles.swatchGrid}>
              {SKIN_TONE_PRESETS.map((preset) => {
                const isSelected =
                  config.materials.skinTone.toLowerCase() ===
                  preset.hex.toLowerCase();
                return (
                  <TouchableOpacity
                    key={preset.hex}
                    style={[
                      styles.swatchCard,
                      isSelected && styles.swatchCardActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        materials: { ...prev.materials, skinTone: preset.hex },
                      }))
                    }
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: preset.hex },
                      ]}
                    />
                    <Text
                      style={[
                        styles.swatchCardText,
                        isSelected && styles.swatchCardTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.paletteTitle, { marginTop: 20 }]}>
              Eye Iris Color
            </Text>
            <View style={styles.swatchGrid}>
              {EYE_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  config.materials.eyeColor.toLowerCase() ===
                  preset.hex.toLowerCase();
                return (
                  <TouchableOpacity
                    key={preset.hex}
                    style={[
                      styles.swatchCard,
                      isSelected && styles.swatchCardActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        materials: { ...prev.materials, eyeColor: preset.hex },
                      }))
                    }
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: preset.hex },
                      ]}
                    />
                    <Text
                      style={[
                        styles.swatchCardText,
                        isSelected && styles.swatchCardTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 3: HAIR STYLE & COLOR */}
        {activeTab === 'hair' && (
          <View style={styles.section}>
            <Text style={styles.paletteTitle}>Select Hairstyle</Text>
            <View style={styles.assetGrid}>
              {[
                { id: 'ponytail01', label: 'Ponytail' },
                { id: 'short02', label: 'Side Part' },
                { id: 'none', label: 'Minimalist' },
              ].map((h) => {
                const isSelected = config.hair.assetId === h.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[
                      styles.assetButton,
                      isSelected && styles.assetButtonActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        hair: {
                          ...prev.hair,
                          assetId: h.id as SupportedHairAssetId,
                        },
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.assetButtonText,
                        isSelected && styles.assetButtonTextActive,
                      ]}
                    >
                      {h.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.paletteTitle, { marginTop: 20 }]}>
              Hair Color Palette
            </Text>
            <View style={styles.swatchGrid}>
              {HAIR_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  config.hair.color.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <TouchableOpacity
                    key={preset.hex}
                    style={[
                      styles.swatchCard,
                      isSelected && styles.swatchCardActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        hair: { ...prev.hair, color: preset.hex },
                      }))
                    }
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: preset.hex },
                      ]}
                    />
                    <Text
                      style={[
                        styles.swatchCardText,
                        isSelected && styles.swatchCardTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 4: WARDROBE & BODY HEIGHT */}
        {activeTab === 'body_outfit' && (
          <View style={styles.section}>
            <Text style={styles.paletteTitle}>Outfit Preset</Text>
            <View style={styles.assetGrid}>
              {[
                { id: 'female_elegantsuit01', label: 'Executive Suit' },
                { id: 'male_casualsuit01', label: 'Casual Blazer' },
                { id: 'casual_tshirt_jeans', label: 'Urban Casual' },
              ].map((c) => {
                const isSelected = config.clothing.topAssetId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.assetButton,
                      isSelected && styles.assetButtonActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        clothing: {
                          ...prev.clothing,
                          topAssetId: c.id as SupportedClothingAssetId,
                        },
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.assetButtonText,
                        isSelected && styles.assetButtonTextActive,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.paletteTitle, { marginTop: 20 }]}>
              Fabric Finish Tint
            </Text>
            <View style={styles.swatchGrid}>
              {OUTFIT_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  config.clothing.topColor?.toLowerCase() ===
                  preset.hex.toLowerCase();
                return (
                  <TouchableOpacity
                    key={preset.hex}
                    style={[
                      styles.swatchCard,
                      isSelected && styles.swatchCardActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({
                        ...prev,
                        clothing: {
                          ...prev.clothing,
                          topColor: preset.hex,
                          bottomColor: preset.hex,
                        },
                      }))
                    }
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: preset.hex },
                      ]}
                    />
                    <Text
                      style={[
                        styles.swatchCardText,
                        isSelected && styles.swatchCardTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Height Slider */}
            <View style={[styles.sliderGroup, { marginTop: 24 }]}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>Companion Body Height</Text>
                <Text style={styles.sliderValue}>
                  {config.body.height.toFixed(2)}×
                </Text>
              </View>
              <Slider
                minimumValue={0.85}
                maximumValue={1.15}
                step={0.01}
                value={config.body.height}
                onValueChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    body: { ...prev.body, height: v },
                  }))
                }
                minimumTrackTintColor="#38bdf8"
                maximumTrackTintColor="#1e293b"
                thumbTintColor="#0ea5e9"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  resetButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0284c7',
    minWidth: 64,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedbackSuccess: {
    backgroundColor: '#065f46',
  },
  feedbackError: {
    backgroundColor: '#991b1b',
  },
  feedbackText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  viewportContainer: {
    height: 320,
    width: '100%',
    backgroundColor: '#020617',
    position: 'relative',
  },
  viewportControls: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modelSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 16,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modelChipActive: {
    backgroundColor: '#0284c7',
  },
  modelChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  modelChipTextActive: {
    color: '#ffffff',
  },
  cameraRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  presetChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetChipActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  presetChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#090d16',
  },
  testSpeechChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  testSpeechChipActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  testSpeechChipText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '600',
  },
  testSpeechChipTextActive: {
    color: '#ffffff',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#38bdf8',
  },
  tabButtonText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#38bdf8',
  },
  controlsScroll: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  controlsContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    gap: 16,
  },
  sliderGroup: {
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sliderLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500',
  },
  sliderValue: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  paletteTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  swatchCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  colorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swatchCardText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  swatchCardTextActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  assetGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  assetButton: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  assetButtonActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#0284c7',
  },
  assetButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  assetButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});