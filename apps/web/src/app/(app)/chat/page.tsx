'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CompanionPersonalityConfig, inferCompanionGender } from '@/lib/companion-presets';
import { AvatarRenderer } from '@/components/companion/AvatarRenderer';
import { useLiveVoiceCompanion } from '@/hooks/useLiveVoiceCompanion';
import { VoiceSettingsModal } from '@/components/companion/VoiceSettingsModal';

interface Companion {
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

interface Conversation {
  id: string;
  user_id: string;
  companion_id: string;
  title: string | null;
  created_at: string;
}

function LiveCompanionStage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCompanionId = searchParams?.get('companionId');

  const { user, isLoading: authLoading } = useAuth();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showCompanionSwitcher, setShowCompanionSwitcher] = useState(false);

  // Infer gender for the selected companion
  const companionGender = inferCompanionGender(selectedCompanion);

  const handleConversationCreated = useCallback((newId: string) => {
    setActiveConversationId(newId);
  }, []);

  // Initialize Voice Session Hook
  const {
    state,
    transcript,
    lastCompanionSpeech,
    errorMessage,
    audioLevel,
    voiceSettings,
    setVoiceSettings,
    availableVoices,
    replaySpeech,
    startListening,
    stopListening,
    interrupt,
    submitText,
    autoplayBlocked,
    resumeAudio,
    handsFree,
    toggleHandsFree,
    isUserSpeaking,
  } = useLiveVoiceCompanion({
    companionId: selectedCompanion?.id,
    conversationId: activeConversationId,
    companionGender,
    companionName: selectedCompanion?.name,
    onConversationCreated: handleConversationCreated,
  });

  // 1. Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // 2. Load user's companions
  const loadCompanions = useCallback(async () => {
    try {
      const response = await fetch('/api/companions');
      if (response.ok) {
        const data = await response.json();
        const list: Companion[] = Array.isArray(data)
          ? data
          : data.items || data.companions || [];
        setCompanions(list);

        if (list.length === 0) {
          // Redirect to onboarding if zero companions exist
          router.push('/onboarding/companion');
          return;
        }

        // Pick matching query ID or active/first companion
        let initial: Companion | undefined;
        if (queryCompanionId) {
          initial = list.find((c) => c.id === queryCompanionId);
        }
        if (!initial) {
          initial = list.find((c) => c.is_active) || list[0];
        }
        setSelectedCompanion(initial || null);
      }
    } catch (e) {
      console.error('Failed to load companions:', e);
    }
  }, [queryCompanionId, router]);

  useEffect(() => {
    if (user) {
      loadCompanions();
    }
  }, [user, loadCompanions]);

  // 3. Load or initiate conversation for selected companion
  useEffect(() => {
    if (!selectedCompanion) return;

    async function loadCompanionConversation() {
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) {
          const data = await res.json();
          const list: Conversation[] = Array.isArray(data) ? data : data.conversations || [];
          const matched = list.find((c) => c.companion_id === selectedCompanion?.id);
          if (matched) {
            setActiveConversationId(matched.id);
          } else {
            setActiveConversationId(null);
          }
        }
      } catch (e) {
        // Ignored
      }
    }
    loadCompanionConversation();
  }, [selectedCompanion]);

  // Keyboard shortcut: Spacebar hold/tap to talk (when not typing in an input)
  const isSpacePressedRef = useRef(false);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.code === 'Space' &&
        !isSpacePressedRef.current &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        isSpacePressedRef.current = true;
        if (state === 'speaking') {
          interrupt();
        } else if (state === 'idle') {
          startListening();
        }
      } else if (e.code === 'Escape') {
        interrupt();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space' && isSpacePressedRef.current) {
        isSpacePressedRef.current = false;
        if (state === 'listening') {
          stopListening();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [interrupt, startListening, state, stopListening]);

  // State label and color indicator
  const stateBadge = (() => {
    switch (state) {
      case 'listening':
        return {
          label: 'Listening...',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-400 animate-ping',
        };
      case 'requesting_microphone':
        return {
          label: 'Requesting Mic...',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-400 animate-pulse',
        };
      case 'processing_speech':
        return {
          label: 'Processing Speech...',
          badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
          dotClass: 'bg-sky-400 animate-pulse',
        };
      case 'generating_response':
        return {
          label: 'Thinking...',
          badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
          dotClass: 'bg-indigo-400 animate-pulse',
        };
      case 'speaking':
        return {
          label: 'Speaking...',
          badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
          dotClass: 'bg-violet-400 animate-bounce',
        };
      case 'interrupted':
        return {
          label: 'Interrupted',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-400',
        };
      case 'error':
        return {
          label: 'Error',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          dotClass: 'bg-rose-400',
        };
      default:
        return {
          label: 'Ready to talk',
          badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
          dotClass: 'bg-slate-400',
        };
    }
  })();

  const personality = selectedCompanion?.personality;
  const traits = personality?.traits || [];
  const style = personality?.style || 'anime';

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-between overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Dynamic Ambient Background Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[140px] opacity-25 transition-all duration-700 ${
            state === 'listening'
              ? 'bg-emerald-500'
              : state === 'speaking'
              ? 'bg-violet-500'
              : state === 'generating_response'
              ? 'bg-indigo-500'
              : 'bg-indigo-900'
          }`}
        />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between p-4 sm:p-6 border-b border-slate-900/80 bg-slate-950/40 backdrop-blur-md">
        {/* Left: Companion Switcher & Details */}
        <div className="relative flex items-center space-x-3.5">
          <Link
            href="/companion"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80 transition"
            title="Exit to Companions Hub"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>

          <div>
            <button
              onClick={() => setShowCompanionSwitcher(!showCompanionSwitcher)}
              className="flex items-center space-x-2 text-left group"
            >
              <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-violet-300 transition">
                {selectedCompanion?.name || 'Companion'}
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700">
                {style}
              </span>
              <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Trait badges */}
            {traits.length > 0 && (
              <div className="flex items-center space-x-1.5 mt-1">
                {traits.slice(0, 3).map((trait) => (
                  <span key={trait} className="text-[10px] text-slate-400">
                    • {trait}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Companion Switcher Dropdown */}
          {showCompanionSwitcher && (
            <div className="absolute top-14 left-0 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Switch Companion
              </div>
              {companions.map((comp) => (
                <button
                  key={comp.id}
                  onClick={() => {
                    setSelectedCompanion(comp);
                    setShowCompanionSwitcher(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition ${
                    selectedCompanion?.id === comp.id
                      ? 'bg-violet-600/20 text-violet-300 font-medium'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{comp.name}</span>
                  <span className="text-[10px] uppercase text-slate-500">{comp.personality?.style || 'AI'}</span>
                </button>
              ))}
              <div className="border-t border-slate-800 pt-1">
                <Link
                  href="/onboarding/companion"
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-violet-400 hover:bg-slate-800 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create New Companion</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Center: Explicit State Status Pill */}
        <div className="hidden sm:flex items-center">
          <div
            className={`flex items-center space-x-2.5 px-4 py-1.5 rounded-full border text-xs font-medium tracking-wide transition-all shadow-sm ${stateBadge.badgeClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${stateBadge.dotClass}`} />
            <span>{stateBadge.label}</span>
          </div>
        </div>

        {/* Right: Customization & Audio Settings Actions */}
        <div className="flex items-center space-x-2">
          {/* Audio Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-xl text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition shadow-sm"
            title="Voice & Audio Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Customize Companion Button */}
          {selectedCompanion && (
            <Link
              href={`/onboarding/companion?editId=${selectedCompanion.id}`}
              className="p-2.5 rounded-xl text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition shadow-sm"
              title="Customize Appearance & Personality"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </Link>
          )}

          {/* Memories */}
          <Link
            href="/memories"
            className="p-2.5 rounded-xl text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition shadow-sm"
            title="Companion Memory Vault"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </Link>
        </div>
      </header>

      {/* Main Center Stage: Prominent Visible Avatar */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-4xl mx-auto w-full">
        {/* Mobile State indicator */}
        <div className="sm:hidden mb-4">
          <div
            className={`flex items-center space-x-2 px-3.5 py-1 rounded-full border text-xs font-medium tracking-wide ${stateBadge.badgeClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${stateBadge.dotClass}`} />
            <span>{stateBadge.label}</span>
          </div>
        </div>

        {/* Error Notification Alert */}
        {errorMessage && state === 'error' && (
          <div className="mb-4 w-full max-w-md p-4 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-center justify-between shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => startListening()}
              className="ml-3 px-2.5 py-1 rounded-lg bg-rose-800/60 hover:bg-rose-700 text-white font-medium shrink-0 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Autoplay prompt banner if browser policy blocked direct audio */}
        {autoplayBlocked && (
          <button
            onClick={resumeAudio}
            className="mb-4 px-4 py-2 rounded-2xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 animate-bounce transition cursor-pointer"
          >
            <span>🔊</span>
            <span>Tap to unmute {selectedCompanion?.name || 'companion'}</span>
          </button>
        )}

        {/* Large Character Portrait */}
        <div className="relative flex flex-col items-center">
          <AvatarRenderer
            config={personality?.avatar_config}
            previewUrl={personality?.avatar_preview_url}
            name={selectedCompanion?.name || 'Companion'}
            size={340}
            state={state}
            audioLevel={audioLevel}
            isSpeaking={state === 'speaking'}
            className="transition-all duration-300"
          />

          {/* Floating Live Speech Subtitle / Caption */}
          <div className="mt-8 max-w-xl text-center px-6 min-h-[5rem] flex items-center justify-center">
            {state === 'speaking' || lastCompanionSpeech ? (
              <div className="space-y-1.5 animate-in fade-in duration-300">
                <div className="flex items-center justify-center space-x-2">
                  <p className="text-base sm:text-lg text-slate-100 font-medium leading-relaxed drop-shadow-sm">
                    &ldquo;{lastCompanionSpeech}&rdquo;
                  </p>
                  {lastCompanionSpeech && state !== 'speaking' && (
                    <button
                      onClick={replaySpeech}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-violet-300 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                      title="Replay voice response"
                      aria-label="Replay voice response"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  {selectedCompanion?.name}
                </div>
              </div>
            ) : state === 'listening' ? (
              <div className="flex flex-col items-center space-y-1 animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-sm font-semibold tracking-wide">
                    {transcript
                      ? `Listening: "${transcript}"`
                      : isUserSpeaking
                      ? 'Listening... (Speech detected)'
                      : handsFree
                      ? 'Listening... Speak naturally'
                      : 'Listening... (Tap mic to send)'}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-400/80">
                  {handsFree
                    ? 'A ~1.5s natural pause will automatically send your turn'
                    : 'Tap mic or press Space to finish'}
                </div>
              </div>
            ) : state === 'processing_speech' ? (
              <div className="text-sm text-sky-400 animate-pulse">
                Transcribing what you said...
              </div>
            ) : state === 'generating_response' ? (
              <div className="text-sm text-indigo-400 animate-pulse">
                {selectedCompanion?.name} is thinking...
              </div>
            ) : transcript ? (
              <div className="text-sm text-slate-400 italic">
                You: &ldquo;{transcript}&rdquo;
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-slate-500 font-light">
                {handsFree ? (
                  <span>
                    Free-Flow Voice active. Tap the microphone or say hello to start.
                  </span>
                ) : (
                  <span>
                    Tap the microphone or hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Space</kbd> to talk.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Control Deck */}
      <footer className="relative z-20 pb-8 pt-4 px-4 flex flex-col items-center justify-center border-t border-slate-900/60 bg-slate-950/60 backdrop-blur-lg">
        {/* Free-Flow Voice Mode Toggle Pill */}
        <div className="mb-4 flex items-center justify-center">
          <button
            type="button"
            onClick={toggleHandsFree}
            className={`group flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
              handsFree
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={
              handsFree
                ? 'Free-Flow Voice is ON: Mic automatically listens after companion speaks and sends when you pause. Tap to switch to manual push-to-talk.'
                : 'Free-Flow Voice is OFF (Manual Push-to-Talk): Tap mic button to speak and tap again to send. Tap to switch to continuous hands-free talking.'
            }
          >
            <span
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                handsFree
                  ? state === 'listening'
                    ? isUserSpeaking
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-emerald-400 animate-pulse'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-slate-500'
              }`}
            />
            <span className="tracking-wide">
              {handsFree ? 'Free-Flow Voice: ON' : 'Free-Flow Voice: OFF'}
            </span>
            <span className="text-[10px] opacity-75 font-normal hidden sm:inline">
              {handsFree ? '(Hands-Free)' : '(Push-to-Talk)'}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-6">
          {/* Optional Keyboard Fallback Toggle */}
          <button
            onClick={() => {
              if (!showTextFallback && state === 'listening') {
                stopListening();
              }
              setShowTextFallback(!showTextFallback);
            }}
            className="p-3.5 rounded-2xl text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:bg-slate-800 transition shadow-md"
            title="Keyboard mode"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>

          {/* Central Main Microphone Control */}
          <div className="relative flex items-center justify-center">
            {/* Animated sound ripple rings while listening */}
            {state === 'listening' && (
              <>
                <div className="absolute w-24 h-24 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
                <div className="absolute w-28 h-28 rounded-full border border-emerald-400/30 animate-pulse pointer-events-none" />
              </>
            )}

            <button
              onClick={() => {
                if (state === 'listening') {
                  stopListening();
                } else if (state === 'speaking') {
                  interrupt();
                } else if (state === 'generating_response' || state === 'processing_speech') {
                  // Do not self-interrupt voice generation from main mic button
                  return;
                } else if (state === 'idle' || state === 'interrupted' || state === 'error') {
                  startListening();
                }
              }}
              disabled={state === 'requesting_microphone'}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                state === 'listening'
                  ? 'bg-emerald-500 text-slate-950 scale-105 shadow-[0_0_50px_rgba(16,185,129,0.5)] ring-4 ring-emerald-400/60'
                  : state === 'speaking'
                  ? 'bg-violet-600 text-white shadow-[0_0_40px_rgba(139,92,246,0.4)] hover:scale-105'
                  : state === 'generating_response' || state === 'processing_speech'
                  ? 'bg-indigo-600 text-white animate-pulse cursor-wait'
                  : 'bg-gradient-to-tr from-violet-600 to-indigo-500 text-white hover:scale-105 hover:shadow-violet-600/30 ring-2 ring-violet-400/20'
              }`}
              title={
                state === 'listening'
                  ? 'Tap or release to finish speaking'
                  : state === 'speaking'
                  ? 'Companion is speaking. Tap to interrupt'
                  : state === 'generating_response' || state === 'processing_speech'
                  ? 'Companion is thinking...'
                  : 'Tap or hold to speak'
              }
            >
              {state === 'listening' ? (
                // Active Sound Wave icon
                <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              ) : state === 'speaking' ? (
                // Speaking Sound Bars icon
                <svg className="w-8 h-8 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                // Microphone icon
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              )}
            </button>
          </div>

          {/* Interrupt Control (Active when speaking or generating) */}
          {(state === 'speaking' || state === 'generating_response') ? (
            <button
              onClick={interrupt}
              className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center space-x-2 transition shadow-lg animate-in fade-in duration-150"
              title="Interrupt speech"
            >
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span>Interrupt</span>
            </button>
          ) : (
            <div className="w-24" />
          )}
        </div>

        {/* Text Input Drawer (Collapsed by default for quiet environments) */}
        {showTextFallback && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textInput.trim()) {
                submitText(textInput.trim());
                setTextInput('');
                setShowTextFallback(false);
              }
            }}
            className="mt-4 w-full max-w-md flex items-center space-x-2 animate-in fade-in duration-200"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type something to your companion..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-50 transition"
            >
              Say
            </button>
          </form>
        )}
      </footer>

      {/* Voice & Audio Settings Modal */}
      <VoiceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={voiceSettings}
        onUpdateSettings={setVoiceSettings}
        availableVoices={availableVoices}
        onTestVoice={replaySpeech}
        companionGender={companionGender}
        companionName={selectedCompanion?.name}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-violet-500 border-t-transparent" />
        </div>
      }
    >
      <LiveCompanionStage />
    </Suspense>
  );
}