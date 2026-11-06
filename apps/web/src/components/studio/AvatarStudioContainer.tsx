'use client';

import React, { useState, useEffect } from 'react';
import {
  Avatar3DConfig,
  DEFAULT_AVATAR_3D_CONFIG,
  SupportedHairAssetId,
  SupportedClothingAssetId,
  migrateAvatarConfig,
} from '@ai-companion/shared';
import { AvatarStudioViewport, CameraPreset } from './AvatarStudioViewport';

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

export const AvatarStudioContainer: React.FC = () => {
  const [config, setConfig] = useState<Avatar3DConfig>(() => ({
    ...DEFAULT_AVATAR_3D_CONFIG,
  }));
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState<string>('My Custom Companion');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('face');
  const [activeTab, setActiveTab] = useState<'face' | 'skin_eyes' | 'hair' | 'clothing'>('face');
  const [isTestSpeaking, setIsTestSpeaking] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 1. Load active companion avatar on mount
  useEffect(() => {
    async function loadActiveAvatar() {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const res = await fetch('/api/avatars/active', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.config) {
            setAvatarId(data.id);
            if (data.name) setAvatarName(data.name);
            setConfig(migrateAvatarConfig(data.config));
          }
        }
      } catch (err) {
        console.warn('[AvatarStudio] Failed to load active avatar from server, using default:', err);
      }
    }

    loadActiveAvatar();
  }, []);

  // 2. Save avatar configuration to backend
  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setFeedback({ message: 'Saved locally (Log in to sync with cloud account)', type: 'success' });
        setIsSaving(false);
        return;
      }

      const payload = {
        name: avatarName,
        config: config,
      };

      const url = avatarId ? `/api/avatars/${avatarId}` : '/api/avatars';
      const method = avatarId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to save avatar (HTTP ${res.status})`);
      }

      const saved = await res.json();
      if (saved.id) setAvatarId(saved.id);
      setFeedback({ message: 'Avatar configuration successfully saved!', type: 'success' });
    } catch (err) {
      console.error('[AvatarStudio] Save error:', err);
      setFeedback({ message: 'Error saving avatar. Check server connection.', type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 3. Reset to defaults
  const handleReset = () => {
    setConfig({ ...DEFAULT_AVATAR_3D_CONFIG });
    setFeedback({ message: 'Reset all customization sliders to default.', type: 'success' });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Morph slider updater
  const updateFaceMorph = (key: keyof Avatar3DConfig['face'], val: number) => {
    setConfig((prev) => ({
      ...prev,
      face: {
        ...prev.face,
        [key]: val,
      },
    }));
  };

  return (
    <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-4rem)] p-4 lg:p-6 gap-6 bg-slate-950 text-slate-100 overflow-hidden">
      {/* LEFT COLUMN: 3D Live Interactive Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse" />
              Aria Avatar Studio
            </h1>
            <p className="text-xs text-slate-400">
              Custom 3D Companion • Real-time Parametric Morph Targets & PBR Shading
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Speech Preview Button */}
            <button
              onClick={() => setIsTestSpeaking((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isTestSpeaking
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isTestSpeaking ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
              {isTestSpeaking ? 'Speaking...' : 'Test Speech'}
            </button>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Avatar'}
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mb-3 p-2.5 rounded-xl text-xs font-medium border flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* 3D Viewport */}
        <div className="flex-1 min-h-0">
          <AvatarStudioViewport
            config={config}
            cameraPreset={cameraPreset}
            onCameraPresetChange={setCameraPreset}
            isTestSpeaking={isTestSpeaking}
          />
        </div>
      </div>

      {/* RIGHT COLUMN: Customization Controls Panel */}
      <div className="w-full lg:w-96 flex flex-col bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-2xl h-full overflow-hidden">
        {/* Category Navigation Tabs */}
        <div className="flex bg-slate-950/70 p-1 rounded-xl border border-slate-800 mb-4">
          <button
            onClick={() => {
              setActiveTab('face');
              setCameraPreset('face');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'face' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Face
          </button>
          <button
            onClick={() => {
              setActiveTab('skin_eyes');
              setCameraPreset('face');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'skin_eyes' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Skin & Eyes
          </button>
          <button
            onClick={() => {
              setActiveTab('hair');
              setCameraPreset('face');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'hair' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Hair
          </button>
          <button
            onClick={() => {
              setActiveTab('clothing');
              setCameraPreset('torso');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'clothing' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Outfit
          </button>
        </div>

        {/* Scrollable Control Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-sm custom-scrollbar">
          {/* TAB 1: FACIAL MORPH SLIDERS */}
          {activeTab === 'face' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Facial Proportions
                </span>
                <button
                  onClick={handleReset}
                  className="text-[11px] text-violet-400 hover:text-violet-300 font-medium"
                >
                  Reset
                </button>
              </div>

              {/* Jaw Width */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Jawline & Chin Projection</span>
                  <span className="font-mono text-violet-400">{config.face.jawWidth.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.jawWidth}
                  onChange={(e) => updateFaceMorph('jawWidth', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Chin Length */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Chin Taper & Contour</span>
                  <span className="font-mono text-violet-400">{config.face.chinLength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.chinLength}
                  onChange={(e) => updateFaceMorph('chinLength', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Cheekbone Height */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Cheekbone Lift & Prominence</span>
                  <span className="font-mono text-violet-400">{config.face.cheekboneHeight.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.cheekboneHeight}
                  onChange={(e) => updateFaceMorph('cheekboneHeight', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Cheekbone Fullness */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Cheek Fullness</span>
                  <span className="font-mono text-violet-400">
                    {(config.face.cheekboneFullness ?? 0.5).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.cheekboneFullness ?? 0.5}
                  onChange={(e) => updateFaceMorph('cheekboneFullness', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Eye Size */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Eye Aperture & Size</span>
                  <span className="font-mono text-violet-400">{config.face.eyeSize.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.eyeSize}
                  onChange={(e) => updateFaceMorph('eyeSize', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Nose Bridge Width */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Nose Bridge & Flare</span>
                  <span className="font-mono text-violet-400">{config.face.noseBridgeWidth.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.noseBridgeWidth}
                  onChange={(e) => updateFaceMorph('noseBridgeWidth', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Lip Fullness */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Lip Fullness & Volume</span>
                  <span className="font-mono text-violet-400">{config.face.lipFullnessUpper.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.lipFullnessUpper}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateFaceMorph('lipFullnessUpper', v);
                    updateFaceMorph('lipFullnessLower', v);
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              {/* Mouth Width */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Mouth Width</span>
                  <span className="font-mono text-violet-400">{config.face.mouthWidth.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={config.face.mouthWidth}
                  onChange={(e) => updateFaceMorph('mouthWidth', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: SKIN & EYES COLOR PALETTE */}
          {activeTab === 'skin_eyes' && (
            <div className="space-y-5">
              {/* Skin Tone */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Skin Tone Presets (PBR Albedo)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {SKIN_TONE_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          materials: { ...prev.materials, skinTone: preset.hex },
                        }))
                      }
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                        config.materials.skinTone.toLowerCase() === preset.hex.toLowerCase()
                          ? 'border-violet-500 bg-violet-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/30 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Eye Color */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Eye Iris Color
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {EYE_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          materials: { ...prev.materials, eyeColor: preset.hex },
                        }))
                      }
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                        config.materials.eyeColor.toLowerCase() === preset.hex.toLowerCase()
                          ? 'border-violet-500 bg-violet-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/30 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HAIRSTYLES & HAIR COLOR */}
          {activeTab === 'hair' && (
            <div className="space-y-5">
              {/* Hairstyle Selection */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Select Hairstyle (Modular Mesh)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ponytail01', label: 'Ponytail' },
                    { id: 'short02', label: 'Side Part' },
                    { id: 'none', label: 'Minimalist' },
                  ].map((h) => (
                    <button
                      key={h.id}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          hair: { ...prev.hair, assetId: h.id as SupportedHairAssetId },
                        }))
                      }
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all text-center ${
                        config.hair.assetId === h.id
                          ? 'border-violet-500 bg-violet-600 text-white shadow-md'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hair Color */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Hair Color Palette
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {HAIR_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          hair: { ...prev.hair, color: preset.hex },
                        }))
                      }
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                        config.hair.color.toLowerCase() === preset.hex.toLowerCase()
                          ? 'border-violet-500 bg-violet-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/30 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CLOTHING & WARDROBE */}
          {activeTab === 'clothing' && (
            <div className="space-y-5">
              {/* Outfit Preset Selection */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Select Outfit (Rigged Garment)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'female_elegantsuit01', label: 'Elegance Suit' },
                    { id: 'male_casualsuit01', label: 'Tailored Blazer' },
                    { id: 'casual_tshirt_jeans', label: 'Casual Daily' },
                  ].map((outfit) => (
                    <button
                      key={outfit.id}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          clothing: {
                            ...prev.clothing,
                            outfitPresetId: outfit.id as SupportedClothingAssetId,
                          },
                        }))
                      }
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all text-center ${
                        config.clothing.outfitPresetId === outfit.id
                          ? 'border-violet-500 bg-violet-600 text-white shadow-md'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {outfit.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Garment Color Tints */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Fabric Color Finish
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {OUTFIT_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          clothing: {
                            ...prev.clothing,
                            topColor: preset.hex,
                            bottomColor: preset.hex,
                          },
                        }))
                      }
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                        config.clothing.topColor?.toLowerCase() === preset.hex.toLowerCase()
                          ? 'border-violet-500 bg-violet-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/30 shadow-sm shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Height Slider */}
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Companion Height Scale</span>
                  <span className="font-mono text-violet-400">
                    {(config.body.height).toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min="0.85"
                  max="1.15"
                  step="0.01"
                  value={config.body.height}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      body: { ...prev.body, height: parseFloat(e.target.value) },
                    }))
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
