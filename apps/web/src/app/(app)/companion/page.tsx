'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  PRESET_AVATARS,
  AVATAR_STYLES,
  CompanionPreset,
  CompanionPersonalityConfig,
} from '@/lib/companion-presets';
import { AvatarRenderer } from '@/components/companion/AvatarRenderer';

interface CompanionItem {
  id: string;
  user_id: string;
  name: string;
  system_prompt?: string | null;
  personality?: (CompanionPersonalityConfig & Record<string, unknown>) | null;
  llm_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CompanionPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [companions, setCompanions] = useState<CompanionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-companions' | 'gallery'>('my-companions');
  const [galleryFilter, setGalleryFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCompanions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/companions');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.items || data.companions || []);
        setCompanions(list);
      }
    } catch (err) {
      console.error('Failed to load companions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user) {
      loadCompanions();
    }
  }, [authLoading, user, router, loadCompanions]);

  async function handleDeleteCompanion(id: string, name: string) {
    if (!confirm(`Are you sure you want to remove companion "${name}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/companions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCompanions((prev) => prev.filter((c) => c.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete companion');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete companion');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredPresets = galleryFilter === 'all'
    ? PRESET_AVATARS
    : PRESET_AVATARS.filter((p: CompanionPreset) => p.style === galleryFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Companion Hub</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold">
              {companions.length} {companions.length === 1 ? 'Companion' : 'Companions'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your AI companions, customize avatars, or create new personalities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/onboarding/companion"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-primary-500/20 transition-all text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Another Companion
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-6 mb-8 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('my-companions')}
          className={cn(
            'px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'my-companions'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          My Companions ({companions.length})
        </button>

        <button
          onClick={() => setActiveTab('gallery')}
          className={cn(
            'px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'gallery'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Preset Avatar Gallery ({PRESET_AVATARS.length})
        </button>
      </div>

      {/* Tab 1: My Companions */}
      {activeTab === 'my-companions' && (
        <div>
          {isLoading ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading your companions...</p>
            </div>
          ) : companions.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4 text-primary-600 dark:text-primary-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No companion yet</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                You haven&apos;t created an AI companion yet. Choose an avatar style, tailor their personality, and start chatting.
              </p>
              <Link
                href="/onboarding/companion"
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium shadow-md shadow-primary-500/20 text-sm transition-all"
              >
                Create Your First Companion
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companions.map((comp) => {
                const personality = comp.personality || {};
                const traits = (personality.traits as string[]) || [];
                const style = (personality.avatar_style as string) || 'Illustrated';
                const bio = (personality.bio as string) || '';
                const avatarConfig = personality.avatar_config;

                return (
                  <div
                    key={comp.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Avatar preview */}
                      <div className="relative w-full h-48 rounded-xl overflow-hidden mb-4 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        {personality.avatar_preview_url || avatarConfig ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <AvatarRenderer
                              previewUrl={personality.avatar_preview_url as string}
                              config={avatarConfig}
                              name={comp.name}
                              size="100%"
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-3xl font-bold">
                            {comp.name.charAt(0)}
                          </div>
                        )}

                        <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-black/60 backdrop-blur-md text-white capitalize z-10">
                          {style}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="mb-4">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-between">
                          <span>{comp.name}</span>
                        </h3>
                        {bio && (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {bio}
                          </p>
                        )}

                        {/* Traits */}
                        {traits.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {traits.map((trait) => (
                              <span
                                key={trait}
                                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              >
                                {trait}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <Link
                        href={`/chat?companionId=${comp.id}`}
                        className="flex-1 py-2 px-3 text-center rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Chat Now
                      </Link>

                      <Link
                        href={`/onboarding/companion?editId=${comp.id}`}
                        className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                        title="Customize appearance and personality"
                      >
                        Customize
                      </Link>

                      <button
                        onClick={() => handleDeleteCompanion(comp.id, comp.name)}
                        disabled={deletingId === comp.id}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs transition-colors"
                        title="Delete companion"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Create New Companion Card */}
              <Link
                href="/onboarding/companion"
                className="group border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[320px] bg-white/40 dark:bg-slate-900/40 hover:bg-primary-50/10"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 text-slate-400 group-hover:text-primary-600 flex items-center justify-center transition-colors mb-3">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">
                  Create Another Companion
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  Pick a new style, distinct traits, and expand your companion circle.
                </p>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Gallery & Presets */}
      {activeTab === 'gallery' && (
        <div>
          {/* Style Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <button
              onClick={() => setGalleryFilter('all')}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                galleryFilter === 'all'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              )}
            >
              All Styles ({PRESET_AVATARS.length})
            </button>
            {AVATAR_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setGalleryFilter(style.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                  galleryFilter === style.id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                )}
              >
                {style.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredPresets.map((preset: CompanionPreset) => (
              <Link
                key={preset.id}
                href={`/onboarding/companion?presetId=${preset.id}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-lg hover:border-primary-500/50 transition-all group flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="relative h-56 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preset.previewUrl}
                      alt={preset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-black/60 text-white backdrop-blur-md capitalize">
                      {preset.style}
                    </span>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {preset.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {preset.tagline || preset.bio}
                    </p>

                    <div className="flex flex-wrap gap-1 mt-3">
                      {preset.traits.slice(0, 3).map((trait: string) => (
                        <span
                          key={trait}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-0">
                  <div className="w-full py-2 px-3 text-center rounded-xl bg-slate-100 group-hover:bg-primary-600 group-hover:text-white dark:bg-slate-800 dark:group-hover:bg-primary-600 text-slate-900 dark:text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5">
                    Personalize {preset.name}
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}

            {/* Customizer card */}
            <Link
              href="/onboarding/companion"
              className="bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-3 shadow-md shadow-indigo-500/30 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white">Create Custom Avatar</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Design custom hair, eyes, skin tone, attire, accessories, and personality from scratch.
              </p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}