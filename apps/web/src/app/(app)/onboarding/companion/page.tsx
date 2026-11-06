'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { AvatarRenderer, AvatarConfig, AvatarLayer } from '@/components/companion/AvatarRenderer';
import {
  COMPANION_PRESETS,
  PERSONALITY_TRAITS,
  AVATAR_STYLES,
  APPEARANCE_OPTIONS,
  CompanionPreset,
  inferCompanionGender,
} from '@/lib/companion-presets';

function OnboardingCompanionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('editId');
  const presetId = searchParams?.get('presetId');
  const { user, isLoading: authLoading } = useAuth();

  // Wizard steps: 1 = choose preset / create own, 2 = customize appearance & personality, 3 = meet
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('all');

  // Companion form state
  const [companionName, setCompanionName] = useState('Luna');
  const [companionBio, setCompanionBio] = useState(
    'A curious, witty, and loyal companion who loves discussing ideas and brightening your day.'
  );
  const [selectedStyle, setSelectedStyle] = useState<'photorealistic' | 'anime' | '3d' | 'illustrated'>('anime');
  const [selectedTraits, setSelectedTraits] = useState<string[]>(['Playful', 'Affectionate', 'Intelligent']);
  const [previewUrl, setPreviewUrl] = useState<string | null>('/avatars/luna-anime.svg');
  const [gender, setGender] = useState<'male' | 'female'>('female');

  // Layered customization state
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    version: 1,
    style: 'anime',
    layers: [
      { type: 'background', variant: 'gradient', color: '#7c3aed' },
      { type: 'skin', variant: 'light', color: '#fecdd3' },
      { type: 'hair', variant: 'flowing', color: '#c084fc' },
      { type: 'eyes', variant: 'round', color: '#db2777' },
      { type: 'clothing', variant: 'casual', color: '#18181b' },
      { type: 'accessory', variant: 'none' },
    ],
  });

  const [activeCustomizeSubtab, setActiveCustomizeSubtab] = useState<'appearance' | 'personality'>('appearance');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // If editing an existing companion
  useEffect(() => {
    if (editId && user) {
      fetch(`/api/companions/${editId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setCompanionName(data.name || '');
            if (data.personality) {
              setCompanionBio(data.personality.bio || '');
              if (Array.isArray(data.personality.traits)) {
                setSelectedTraits(data.personality.traits);
              }
              if (data.personality.style) {
                setSelectedStyle(data.personality.style);
              }
              if (data.personality.avatar_config) {
                setAvatarConfig(data.personality.avatar_config);
              }
              if (data.personality.gender === 'male' || data.personality.gender === 'female') {
                setGender(data.personality.gender);
              } else {
                setGender(inferCompanionGender(data));
              }
              if (data.personality.avatar_preview_url) {
                setPreviewUrl(data.personality.avatar_preview_url);
              }
            }
            setStep(2);
          }
        })
        .catch((err) => console.error('Failed to load companion for editing:', err));
    } else if (presetId && !editId) {
      const match = COMPANION_PRESETS.find((p) => p.id === presetId);
      if (match) {
        handleSelectPreset(match);
      }
    }
  }, [editId, presetId, user]);

  // Preset Selection handler
  function handleSelectPreset(preset: CompanionPreset) {
    setCompanionName(preset.name);
    setCompanionBio(preset.bio);
    setSelectedStyle(preset.style);
    setSelectedTraits([...preset.traits]);
    setPreviewUrl(preset.previewUrl);
    setAvatarConfig(JSON.parse(JSON.stringify(preset.config)));
    setGender(preset.gender || 'female');
    setStep(2);
  }

  // Create your own from scratch
  function handleCreateOwn() {
    setCompanionName('Nova');
    setCompanionBio('A newly designed AI companion ready to explore life and deep conversations.');
    setSelectedStyle('anime');
    setSelectedTraits(['Caring', 'Intelligent', 'Thoughtful']);
    setPreviewUrl(null); // Force dynamic SVG layer rendering
    setGender('female');
    setAvatarConfig({
      version: 1,
      style: 'anime',
      layers: [
        { type: 'background', variant: 'gradient', color: '#4338ca' },
        { type: 'skin', variant: 'light', color: '#fed7aa' },
        { type: 'hair', variant: 'short', color: '#334155' },
        { type: 'eyes', variant: 'almond', color: '#2563eb' },
        { type: 'clothing', variant: 'casual', color: '#1e293b' },
        { type: 'accessory', variant: 'none' },
      ],
    });
    setStep(2);
  }

  // Trait toggle
  function toggleTrait(traitId: string) {
    setSelectedTraits((prev) => {
      if (prev.includes(traitId)) {
        return prev.filter((t) => t !== traitId);
      } else {
        if (prev.length >= 5) return prev; // max 5 traits
        return [...prev, traitId];
      }
    });
  }

  // Appearance Layer update
  function updateLayer(type: 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background', updates: Partial<AvatarConfig['layers'][0]>) {
    setPreviewUrl(null); // Switch to dynamic SVG layered rendering on custom tweak
    setAvatarConfig((prev) => {
      const existing = prev.layers.find((l) => l.type === type);
      let updatedLayers;
      if (existing) {
        updatedLayers = prev.layers.map((l) => (l.type === type ? { ...l, ...updates } : l));
      } else {
        updatedLayers = [...prev.layers, { type, variant: 'default', ...updates } as AvatarLayer];
      }
      return {
        ...prev,
        layers: updatedLayers,
      };
    });
  }

  // Final submission
  async function handleFinalizeCompanion() {
    if (isSubmitting) return; // Prevent double submission
    if (!companionName.trim()) {
      setSubmitError('Please give your companion a name.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const personalityPayload = {
        traits: selectedTraits,
        bio: companionBio.trim(),
        style: selectedStyle,
        avatar_preview_url: previewUrl,
        avatar_config: avatarConfig,
        gender: gender,
      };

      let companionId = editId;

      if (editId) {
        // Update existing companion
        const updateRes = await fetch(`/api/companions/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: companionName.trim(),
            personality: personalityPayload,
          }),
        });

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to update companion');
        }
      } else {
        // Create new companion
        const createRes = await fetch('/api/companions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: companionName.trim(),
            personality: personalityPayload,
            llm_config: { provider: 'ollama' },
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to create companion');
        }

        const newComp = await createRes.json();
        companionId = newComp.id;
      }

      // Also persist to avatar table for backward compatibility
      try {
        await fetch('/api/avatars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${companionName.trim()}'s Avatar`,
            config: avatarConfig,
          }),
        });
      } catch (e) {
        // Non-blocking
        console.warn('Avatar record sync notice:', e);
      }

      // Seamlessly transition to the companion's chat!
      router.push(`/chat?companionId=${companionId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save companion');
      setIsSubmitting(false);
    }
  }

  // Filtered presets
  const filteredPresets = COMPANION_PRESETS.filter(
    (p) => selectedStyleFilter === 'all' || p.style === selectedStyleFilter
  );

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/companion" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white text-lg font-bold">✨</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
              AI Companion
            </span>
          </Link>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-medium ml-2">
            {editId ? 'Edit Companion' : 'Companion Studio'}
          </span>
        </div>

        {/* Wizard Steps Tracker */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => setStep(1)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              step === 1 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            )}
          >
            1. Choose Avatar
          </button>
          <span className="text-slate-600">→</span>
          <button
            onClick={() => setStep(2)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              step === 2 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            )}
          >
            2. Personalize
          </button>
          <span className="text-slate-600">→</span>
          <button
            onClick={() => setStep(3)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              step === 3 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            )}
          >
            3. Meet & Chat
          </button>
        </div>

        <Link
          href="/companion"
          className="text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Cancel
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {/* STEP 1: CHOOSE AVATAR GALLERY */}
        {step === 1 && (
          <div className="space-y-8 animate-fadeIn">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Choose Your Companion Avatar
              </h1>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                Select a character archetype to personalize, or craft a completely unique custom companion from scratch.
              </p>
            </div>

            {/* Category / Style Filter Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {AVATAR_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyleFilter(style.id)}
                  className={cn(
                    'px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all',
                    selectedStyleFilter === style.id
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/50'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>

            {/* Avatar Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
              {/* "Create Your Own" Card */}
              <div
                onClick={handleCreateOwn}
                className="group relative border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-3xl p-6 bg-slate-900/40 hover:bg-slate-900/80 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[380px] shadow-lg hover:shadow-indigo-500/10"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-3xl text-white shadow-xl group-hover:scale-110 transition-transform mb-5">
                  ✨
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                  Create Your Own
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 px-4 leading-relaxed">
                  Design a fully customized avatar from scratch with bespoke features, style, and personality.
                </p>
                <button
                  type="button"
                  className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 group-hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
                >
                  Start Customizer →
                </button>
              </div>

              {/* Preset Cards */}
              {filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="group relative bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col"
                >
                  {/* Portrait Container */}
                  <div className="relative aspect-square w-full bg-slate-950 overflow-hidden">
                    <AvatarRenderer
                      previewUrl={preset.previewUrl}
                      name={preset.name}
                      size="100%"
                      className="rounded-none h-full"
                    />
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-slate-950/80 border border-slate-700/80 text-indigo-300 backdrop-blur-md">
                        {preset.style}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-indigo-400/90 font-medium mt-0.5">
                        {preset.tagline}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {preset.bio}
                      </p>

                      {/* Traits Chips */}
                      <div className="flex flex-wrap gap-1.5 mt-3.5">
                        {preset.traits.map((trait) => (
                          <span
                            key={trait}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-medium"
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectPreset(preset)}
                      className="mt-5 w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>Choose & Personalize</span>
                      <span className="text-sm">→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: CUSTOMIZATION EXPERIENCE */}
        {step === 2 && (
          <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
            {/* Step Controls */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                ← Back to Gallery
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(3)}
                  disabled={!companionName.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5"
                >
                  <span>Review & Meet</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* Studio Layout: Left Preview, Right Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-start">
              {/* Character Preview Column */}
              <div className="lg:col-span-5 flex flex-col items-center sticky top-24">
                <div className="w-full max-w-[340px] aspect-square rounded-3xl p-3 bg-gradient-to-tr from-slate-800/80 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-2xl flex items-center justify-center">
                  <AvatarRenderer
                    config={avatarConfig}
                    previewUrl={previewUrl}
                    name={companionName}
                    size="100%"
                    className="h-full rounded-2xl"
                  />
                </div>

                <div className="mt-4 text-center max-w-[320px]">
                  <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                    {companionName || 'Unnamed'}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 font-semibold border border-indigo-700/50 uppercase">
                      {selectedStyle}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {companionBio || 'No biography written yet.'}
                  </p>

                  <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                    {selectedTraits.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customizer Tabs & Controls Column */}
              <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col">
                {/* Subtab Toggle: Appearance vs Personality */}
                <div className="flex rounded-2xl bg-slate-950 p-1.5 border border-slate-800 mb-6">
                  <button
                    onClick={() => setActiveCustomizeSubtab('appearance')}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
                      activeCustomizeSubtab === 'appearance'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    🎨 Appearance Options
                  </button>
                  <button
                    onClick={() => setActiveCustomizeSubtab('personality')}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
                      activeCustomizeSubtab === 'personality'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    🧠 Personality & Identity
                  </button>
                </div>

                {/* Subtab 1: Appearance */}
                {activeCustomizeSubtab === 'appearance' && (
                  <div className="space-y-6">
                    {/* Avatar Style Selector */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Avatar Art Style
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(['photorealistic', 'anime', '3d', 'illustrated'] as const).map((style) => (
                          <button
                            key={style}
                            onClick={() => setSelectedStyle(style)}
                            className={cn(
                              'py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all',
                              selectedStyle === style
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                            )}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Skin Tone */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Skin Tone
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {APPEARANCE_OPTIONS.skinTones.map((skin) => (
                          <button
                            key={skin.variant}
                            onClick={() => updateLayer('skin', { variant: skin.variant, color: skin.value })}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 transition-all text-xs text-slate-300"
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-black/20"
                              style={{ backgroundColor: skin.value }}
                            />
                            <span>{skin.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hair Style & Color */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                        Hair Style & Color
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {APPEARANCE_OPTIONS.hairStyles.map((h) => (
                          <button
                            key={h.variant}
                            onClick={() => updateLayer('hair', { variant: h.variant })}
                            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 text-xs text-slate-300"
                          >
                            {h.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {APPEARANCE_OPTIONS.hairColors.map((c) => (
                          <button
                            key={c.color}
                            onClick={() => updateLayer('hair', { color: c.color })}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-300"
                          >
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="text-[11px]">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Eye Shape & Color */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                        Eyes & Expression
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {APPEARANCE_OPTIONS.eyeShapes.map((e) => (
                          <button
                            key={e.variant}
                            onClick={() => updateLayer('eyes', { variant: e.variant })}
                            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 text-xs text-slate-300"
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {APPEARANCE_OPTIONS.eyeColors.map((c) => (
                          <button
                            key={c.color}
                            onClick={() => updateLayer('eyes', { color: c.color })}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-300"
                          >
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="text-[11px]">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clothing Style */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Clothing & Attire
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {APPEARANCE_OPTIONS.clothingStyles.map((cloth) => (
                          <button
                            key={cloth.label}
                            onClick={() => updateLayer('clothing', { variant: cloth.variant, color: cloth.color })}
                            className="py-2 px-3 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 text-xs text-slate-300"
                          >
                            {cloth.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Accessories */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Accessories
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {APPEARANCE_OPTIONS.accessories.map((acc) => (
                          <button
                            key={acc.variant}
                            onClick={() => updateLayer('accessory', { variant: acc.variant, color: acc.color })}
                            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 text-xs text-slate-300"
                          >
                            {acc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Background Ambience */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Background Mood
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {APPEARANCE_OPTIONS.backgrounds.map((bg) => (
                          <button
                            key={bg.color}
                            onClick={() => updateLayer('background', { color: bg.color })}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-slate-600 text-xs text-slate-300"
                          >
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: bg.color }} />
                            <span>{bg.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Subtab 2: Personality & Identity */}
                {activeCustomizeSubtab === 'personality' && (
                  <div className="space-y-6">
                    {/* Companion Name */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Companion Name *
                      </label>
                      <input
                        type="text"
                        value={companionName}
                        onChange={(e) => setCompanionName(e.target.value)}
                        placeholder="e.g. Luna, Marcus, Aria..."
                        maxLength={50}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>

                    {/* Avatar Gender & Voice Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Avatar Gender & Voice Persona
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setGender('female')}
                          className={cn(
                            'p-3.5 rounded-2xl border text-left transition flex items-start space-x-3',
                            gender === 'female'
                              ? 'bg-pink-600/15 border-pink-500 text-pink-200 shadow-sm'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                          )}
                        >
                          <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm shrink-0', gender === 'female' ? 'bg-pink-500 text-white' : 'bg-slate-800 text-slate-400')}>
                            ♀
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-white">Female Voice</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">Natural feminine tone, distinct resonance</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGender('male')}
                          className={cn(
                            'p-3.5 rounded-2xl border text-left transition flex items-start space-x-3',
                            gender === 'male'
                              ? 'bg-blue-600/15 border-blue-500 text-blue-200 shadow-sm'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                          )}
                        >
                          <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm shrink-0', gender === 'male' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400')}>
                            ♂
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-white">Male Voice</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">Natural masculine tone, deep acoustic resonance</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Personality Traits Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                          Personality Traits ({selectedTraits.length}/5)
                        </label>
                        <span className="text-[11px] text-slate-500">Pick up to 5 traits</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {PERSONALITY_TRAITS.map((trait) => {
                          const isSelected = selectedTraits.includes(trait.id);
                          return (
                            <button
                              key={trait.id}
                              type="button"
                              onClick={() => toggleTrait(trait.id)}
                              className={cn(
                                'text-left p-3 rounded-2xl border transition-all',
                                isSelected
                                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs">{trait.label}</span>
                                {isSelected && <span className="text-indigo-400 text-xs">✓</span>}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                                {trait.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Biography / Persona */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Background & Conversational Style
                      </label>
                      <textarea
                        value={companionBio}
                        onChange={(e) => setCompanionBio(e.target.value)}
                        rows={4}
                        placeholder="Describe how your companion speaks, their background story, and interests..."
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm leading-relaxed"
                      />
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        This background naturally informs their perspective and conversational tone.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: MEET YOUR COMPANION & CONFIRMATION */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto w-full space-y-8 animate-fadeIn my-auto py-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
                Meet Your Companion
              </h1>
              <p className="text-slate-400 text-sm">
                Everything is set! Review your companion before stepping into your personal space.
              </p>
            </div>

            {/* Showcase Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col sm:flex-row items-center gap-8">
              <div className="w-48 h-48 sm:w-56 sm:h-56 flex-shrink-0">
                <AvatarRenderer
                  config={avatarConfig}
                  previewUrl={previewUrl}
                  name={companionName}
                  size="100%"
                  className="rounded-2xl"
                />
              </div>

              <div className="flex-1 space-y-4 text-center sm:text-left">
                <div>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h2 className="text-2xl font-bold text-white">{companionName}</h2>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                      {selectedStyle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed italic">
                    "{companionBio}"
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Personality Traits
                  </h4>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                    {selectedTraits.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2.5 py-1 rounded-lg bg-indigo-900/40 text-indigo-200 border border-indigo-700/40 font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {submitError && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-700/60 text-red-300 text-xs text-center">
                {submitError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold transition-all"
              >
                ← Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalizeCompanion}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 disabled:opacity-50 text-white text-sm font-bold shadow-xl shadow-indigo-500/25 transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Preparing Companion...</span>
                  </>
                ) : (
                  <>
                    <span>Start Chatting with {companionName}</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function OnboardingCompanionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingCompanionContent />
    </Suspense>
  );
}
