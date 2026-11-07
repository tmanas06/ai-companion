'use client';

import React, { useEffect, useState, useRef } from 'react';

export type CompanionVoiceState =
  | 'idle'
  | 'requesting_microphone'
  | 'listening'
  | 'processing_speech'
  | 'generating_response'
  | 'speaking'
  | 'interrupted'
  | 'error';

export interface AvatarLayerConfig {
  type: 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  zIndex?: number;
  visible?: boolean;
}

export type AvatarLayer = AvatarLayerConfig;

export interface AvatarConfig {
  version: number;
  style?: 'photorealistic' | 'anime' | '3d' | 'illustrated';
  layers?: AvatarLayerConfig[];
}

export type VisemeType = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface VisemeCue {
  start: number; // in seconds
  end: number;   // in seconds
  viseme: VisemeType;
}

/**
 * Standard aperture intensity mapping for Preston Blair / Rhubarb viseme set.
 * X: Closed rest (silence/pause)
 * A: Closed mouth for bilabials (/m/, /b/, /p/)
 * B: Slightly open mouth with teeth showing (/s/, /t/, /d/, /k/)
 * C: Open mouth (/e/, /eh/, /n/)
 * D: Wide open mouth (/aa/, /ae/, /ah/)
 * E: Slightly rounded mouth (/er/, /ao/)
 * F: Puckered / rounded lips (/w/, /oo/, /uw/)
 * G: Upper teeth on lower lip (/f/, /v/)
 * H: Wide open mouth with tongue visible (/l/)
 */
export const VISEME_APERTURE_MAP: Record<VisemeType, number> = {
  X: 0.0,
  A: 0.0,
  B: 0.25,
  C: 0.55,
  D: 0.95,
  E: 0.65,
  F: 0.35,
  G: 0.20,
  H: 0.45,
};

import { Avatar3DConfig } from '@ai-companion/shared';

export type AvatarExpression = 'neutral' | 'happy' | 'thoughtful' | 'concerned';

export interface AvatarRendererProps {
  config?: AvatarConfig | Avatar3DConfig;
  previewUrl?: string | null;
  name?: string;
  className?: string;
  size?: number | string;
  state?: CompanionVoiceState;
  audioLevel?: number; // Normalized 0.0 to 1.0 from microphone or audio player
  isSpeaking?: boolean;
  visemes?: VisemeCue[];
  currentTime?: number; // Active playback time in seconds
  expression?: AvatarExpression;
  framing?: 'face' | 'upper' | 'full';
  stageMode?: boolean;
}

export interface CompanionLandmarks {
  eyeX: string;
  eyeY: string;
  eyeWidth: string;
  eyeHeight: string;
  mouthX: string;
  mouthY: string;
  mouthWidth: string;
  mouthHeight: string;
}

export interface ResolvedAvatarAssets {
  portraitUrl: string;
  fullbodyUrl?: string | null;
  blinkUrl: string | null;
  speakUrl: string | null;
  expressions?: {
    happy?: string | null;
    thoughtful?: string | null;
    concerned?: string | null;
  };
  landmarks: CompanionLandmarks;
}

/**
 * Resolves local photorealistic avatar assets and empirical facial landmark masks.
 */
export function resolveCompanionAssets(
  previewUrl?: string | null,
  name: string = 'Companion'
): ResolvedAvatarAssets | null {
  if (!previewUrl) return null;

  const urlLower = previewUrl.toLowerCase();
  const nameLower = name.toLowerCase();

  // 1. Aria
  if (urlLower.includes('aria') || nameLower.includes('aria')) {
    return {
      portraitUrl: '/avatars/aria-portrait.webp',
      fullbodyUrl: '/avatars/aria-fullbody.webp',
      blinkUrl: '/avatars/aria-blink.webp',
      speakUrl: '/avatars/aria-speak.webp',
      expressions: {
        happy: '/avatars/aria-happy.webp',
        thoughtful: '/avatars/aria-thoughtful.webp',
        concerned: '/avatars/aria-concerned.webp',
      },
      landmarks: {
        eyeX: '49.6%',
        eyeY: '36.0%',
        eyeWidth: '36%',
        eyeHeight: '16%',
        mouthX: '50.1%',
        mouthY: '58.5%',
        mouthWidth: '30%',
        mouthHeight: '18%',
      },
    };
  }

  // 2. Marcus
  if (urlLower.includes('marcus') || nameLower.includes('marcus')) {
    return {
      portraitUrl: '/avatars/marcus-portrait.webp',
      fullbodyUrl: '/avatars/marcus-fullbody.webp',
      blinkUrl: '/avatars/marcus-blink.webp',
      speakUrl: '/avatars/marcus-speak.webp',
      landmarks: {
        eyeX: '52.8%',
        eyeY: '34.4%',
        eyeWidth: '34%',
        eyeHeight: '16%',
        mouthX: '53.0%',
        mouthY: '57.3%',
        mouthWidth: '30%',
        mouthHeight: '18%',
      },
    };
  }

  // 3. Elena
  if (urlLower.includes('elena') || nameLower.includes('elena')) {
    return {
      portraitUrl: '/avatars/elena-portrait.webp',
      fullbodyUrl: '/avatars/elena-fullbody.webp',
      blinkUrl: '/avatars/elena-blink.webp',
      speakUrl: '/avatars/elena-speak.webp',
      landmarks: {
        eyeX: '51.0%',
        eyeY: '33.8%',
        eyeWidth: '36%',
        eyeHeight: '16%',
        mouthX: '52.3%',
        mouthY: '51.9%',
        mouthWidth: '32%',
        mouthHeight: '18%',
      },
    };
  }

  // 4. Liam
  if (urlLower.includes('liam') || nameLower.includes('liam')) {
    return {
      portraitUrl: '/avatars/liam-portrait.webp',
      fullbodyUrl: '/avatars/liam-fullbody.webp',
      blinkUrl: '/avatars/liam-blink.webp',
      speakUrl: '/avatars/liam-speak.webp',
      landmarks: {
        eyeX: '51.6%',
        eyeY: '38.3%',
        eyeWidth: '36%',
        eyeHeight: '16%',
        mouthX: '51.5%',
        mouthY: '60.9%',
        mouthWidth: '32%',
        mouthHeight: '18%',
      },
    };
  }

  // Generic custom portrait without pre-rendered blink/speak states
  return {
    portraitUrl: previewUrl,
    blinkUrl: null,
    speakUrl: null,
    landmarks: {
      eyeX: '50%',
      eyeY: '36%',
      eyeWidth: '30%',
      eyeHeight: '12%',
      mouthX: '50%',
      mouthY: '54%',
      mouthWidth: '24%',
      mouthHeight: '14%',
    },
  };
}

export const AvatarRenderer: React.FC<AvatarRendererProps> = ({
  previewUrl,
  name = 'Companion',
  className = '',
  size = 280,
  state = 'idle',
  audioLevel = 0,
  isSpeaking = false,
  visemes,
  currentTime,
  expression = 'neutral',
  framing = 'upper',
  stageMode = false,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouthIntensity, setMouthIntensity] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failedExpressions, setFailedExpressions] = useState<Set<string>>(() => new Set());
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeSpeaking = isSpeaking || state === 'speaking';
  const isListening = state === 'listening';

  const resolved = resolveCompanionAssets(previewUrl, name);

  const activeExpressionUrl =
    expression && expression !== 'neutral' && resolved?.expressions
      ? resolved.expressions[expression] ?? null
      : null;

  // Detect accessibility prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
      } else if (typeof (mediaQuery as unknown as { addListener?: (fn: unknown) => void }).addListener === 'function') {
        (mediaQuery as unknown as { addListener: (fn: unknown) => void }).addListener(handler);
        return () => (mediaQuery as unknown as { removeListener: (fn: unknown) => void }).removeListener(handler);
      }
    } catch {
      // Ignored in non-browser testing environments
    }
  }, []);

  // Periodic natural human blink cycle (130ms duration every 3.2s to 5.8s)
  // When listening attentively, blink frequency naturally slows down
  useEffect(() => {
    let active = true;

    const triggerNextBlink = () => {
      const baseDelay = isListening ? 4500 : 3200;
      const jitter = isListening ? 3000 : 2600;
      const delay = baseDelay + Math.random() * jitter;

      blinkTimerRef.current = setTimeout(() => {
        if (!active) return;
        setIsBlinking(true);
        setTimeout(() => {
          if (!active) return;
          setIsBlinking(false);
          triggerNextBlink();
        }, 140);
      }, delay);
    };

    triggerNextBlink();

    return () => {
      active = false;
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
    };
  }, [isListening]);

  // Speech mouth movement: uses timed viseme sequence if available, or amplitude envelope fallback
  useEffect(() => {
    if (!activeSpeaking) {
      setMouthIntensity(0);
      return;
    }

    let animId: number;

    const animateMouth = () => {
      let target = 0;

      if (visemes && visemes.length > 0 && typeof currentTime === 'number') {
        // High-precision viseme timing synchronization
        const activeCue = visemes.find(
          (cue) => currentTime >= cue.start && currentTime <= cue.end
        );
        if (activeCue) {
          target = VISEME_APERTURE_MAP[activeCue.viseme] ?? 0;
        } else {
          // Silence/pause between words or phrases
          target = 0.0;
        }
      } else if (audioLevel > 0.03) {
        // Amplitude-based envelope fallback
        target = Math.min(1.0, audioLevel * 1.5);
      } else {
        // Silence/pause during speech turn
        target = 0.0;
      }

      setMouthIntensity((prev) => {
        // Fast, natural attack/decay lerp (0.40) to prevent robotic stepping
        const next = prev + (target - prev) * 0.40;
        return next < 0.01 ? 0 : next;
      });

      animId = requestAnimationFrame(animateMouth);
    };

    animId = requestAnimationFrame(animateMouth);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [activeSpeaking, audioLevel, currentTime, visemes]);

  // Voice state visual aura styling
  const stateAura = (() => {
    switch (state) {
      case 'listening':
        return 'ring-4 ring-emerald-400/80 shadow-[0_0_40px_rgba(52,211,153,0.35)]';
      case 'processing_speech':
      case 'generating_response':
        return 'ring-4 ring-indigo-500/80 shadow-[0_0_40px_rgba(99,102,241,0.4)] animate-pulse';
      case 'speaking':
        return 'ring-4 ring-violet-500/80 shadow-[0_0_45px_rgba(139,92,246,0.45)]';
      case 'interrupted':
        return 'ring-4 ring-amber-400/80 shadow-[0_0_30px_rgba(251,191,36,0.3)]';
      case 'error':
        return 'ring-4 ring-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.35)]';
      default:
        return 'ring-1 ring-slate-800 shadow-2xl';
    }
  })();

  // Natural state posture transform (disabled if reduced-motion is active)
  const postureTransformClass = (() => {
    if (reducedMotion) return '';
    switch (state) {
      case 'listening':
        return 'scale-[1.015] -rotate-1 translate-y-[-1px]';
      case 'processing_speech':
      case 'generating_response':
        return 'scale-[1.008] rotate-1 translate-y-[-1px]';
      case 'speaking':
        return 'scale-[1.01] translate-y-[-1px]';
      case 'interrupted':
        return 'scale-[1.0] translate-y-0';
      default:
        return 'scale-100 translate-y-0';
    }
  })();

  // Fallback state when previewUrl is null, undefined, or image loading failed
  if (!previewUrl || imageError || !resolved) {
    const initials = (name || 'AI')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div
        className={`relative overflow-hidden rounded-3xl transition-all duration-300 flex flex-col items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 select-none ${stateAura} ${className}`}
        style={{ width: size, height: size }}
        aria-label={name}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-1/3 h-1/3 text-slate-600 mb-2 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="50" cy="38" r="18" />
          <path d="M22 84 C22 66 34 58 50 58 C66 58 78 66 78 84" />
        </svg>
        <span className="text-xl font-bold tracking-wider text-slate-300">{initials}</span>
      </div>
    );
  }

  const { portraitUrl, fullbodyUrl, blinkUrl, speakUrl, landmarks } = resolved;
  const hasFullBody = !!fullbodyUrl;
  const stageBaseImg = fullbodyUrl || previewUrl || portraitUrl;
  const baseImgSrc = stageMode ? stageBaseImg : (previewUrl || portraitUrl);

  // 1. Full Stage Presentation Mode — GTA-grade Cinematic Rendering
  if (stageMode) {
    // Voice-state reactive rim light colours (simulates GTA bounce lighting)
    const rimColor = activeSpeaking
      ? 'rgba(167,139,250,0.55)'
      : isListening
      ? 'rgba(52,211,153,0.45)'
      : 'rgba(148,163,184,0.22)';

    const warmFill = activeSpeaking
      ? 'rgba(251,191,36,0.13)'
      : 'rgba(253,224,164,0.07)';

    return (
      <div
        data-testid="photorealistic-2d-stage-renderer"
        className={`relative w-full h-full flex flex-col items-center justify-center select-none overflow-hidden ${className}`}
      >
        {/* ── Key Light: warm diagonal fill from upper-left ── */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-1000"
          style={{ background: `radial-gradient(ellipse 60% 65% at 32% 15%, ${warmFill} 0%, transparent 65%)` }}
          aria-hidden="true"
        />

        {/* ── Ambient Voice-Reactive Back Light ── */}
        <div
          className={`absolute inset-0 pointer-events-none transition-all duration-1000 ${
            activeSpeaking
              ? 'opacity-25 bg-[radial-gradient(ellipse_55%_65%_at_50%_38%,rgba(255,255,255,0.08)_0%,transparent_70%)]'
              : isListening
              ? 'opacity-35 bg-[radial-gradient(ellipse_55%_65%_at_50%_38%,rgba(52,211,153,0.22)_0%,transparent_70%)]'
              : 'opacity-10 bg-[radial-gradient(ellipse_55%_65%_at_50%_38%,rgba(255,255,255,0.04)_0%,transparent_70%)]'
          }`}
          aria-hidden="true"
        />

        {/* ── Hard Specular Rim Light (right edge, like GTA NPC lighting) ── */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700"
          style={{ background: `linear-gradient(268deg, ${rimColor} 0%, transparent 26%)` }}
          aria-hidden="true"
        />

        {/* ── Layered Contact Shadows (umbra + penumbra + AO) ── */}
        <div
          className={`absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-32 sm:w-44 h-3 sm:h-4 bg-black/90 rounded-full pointer-events-none transition-all duration-700 ${framing === 'full' ? 'opacity-100 scale-100' : 'opacity-30 scale-75'}`}
          style={{ filter: 'blur(5px)' }}
          aria-hidden="true"
        />
        <div
          className={`absolute bottom-3 sm:bottom-7 left-1/2 -translate-x-1/2 w-52 sm:w-80 h-7 sm:h-12 bg-black/65 rounded-full pointer-events-none transition-all duration-700 ${framing === 'full' ? 'opacity-100 scale-100' : 'opacity-25 scale-75'}`}
          style={{ filter: 'blur(20px)' }}
          aria-hidden="true"
        />
        <div
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-72 sm:w-[420px] h-12 sm:h-20 bg-black/45 rounded-full pointer-events-none transition-all duration-700 ${framing === 'full' ? 'opacity-80' : 'opacity-20'}`}
          style={{ filter: 'blur(36px)' }}
          aria-hidden="true"
        />

        {/* ── Character Stage Figure ── */}
        <div className="relative h-[82vh] max-h-[820px] aspect-[9/16] flex items-center justify-center pointer-events-none">
          {/* Camera Framing Rig */}
          <div
            data-testid="avatar-camera-framing-rig"
            className="relative w-full h-full transform-gpu transition-transform duration-700 ease-out flex items-center justify-center"
            style={{
              transform:
                framing === 'face'
                  ? 'scale(2.6) translateY(12%)'
                  : framing === 'upper'
                  ? 'scale(1.85) translateY(6%)'
                  : 'scale(1) translateY(0%)',
              transformOrigin: '50% 18%',
            }}
          >
            {/* Breathing & Posture Motion Layer */}
            <div
              data-testid="avatar-head-container"
              className={`relative w-full h-full transform-gpu transition-all duration-700 ease-out ${postureTransformClass}`}
              style={{
                animation: reducedMotion ? 'none' : 'ai-companion-breathe 6s ease-in-out infinite',
                transformOrigin: '50% 18%',
              }}
            >
              {/* ── Subsurface Scattering glow (warm skin translucency bloom) ── */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stageBaseImg}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{
                  filter: 'blur(22px) saturate(1.5) brightness(1.2)',
                  opacity: activeSpeaking ? 0.20 : 0.11,
                  mixBlendMode: 'screen',
                  maskImage: fullbodyUrl
                    ? undefined
                    : 'radial-gradient(ellipse 65% 80% at 50% 48%, black 50%, transparent 95%)',
                  WebkitMaskImage: fullbodyUrl
                    ? undefined
                    : 'radial-gradient(ellipse 65% 80% at 50% 48%, black 50%, transparent 95%)',
                }}
              />

              {/* ── Base Character — GTA-style colour grade ── */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stageBaseImg}
                alt={name}
                onError={() => setImageError(true)}
                className="w-full h-full object-contain select-none pointer-events-none"
                style={{
                  filter: [
                    'drop-shadow(0 28px 56px rgba(0,0,0,0.90))',
                    'drop-shadow(0 10px 20px rgba(0,0,0,0.65))',
                    'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                    'contrast(1.07)',
                    'saturate(1.14)',
                    activeSpeaking ? 'brightness(1.05)' : 'brightness(1.00)',
                  ].join(' '),
                  maskImage: fullbodyUrl
                    ? undefined
                    : 'radial-gradient(ellipse 65% 80% at 50% 48%, black 50%, transparent 95%)',
                  WebkitMaskImage: fullbodyUrl
                    ? undefined
                    : 'radial-gradient(ellipse 65% 80% at 50% 48%, black 50%, transparent 95%)',
                }}
              />

              {/* Expression Overlay */}
              {!hasFullBody && activeExpressionUrl && !failedExpressions.has(activeExpressionUrl) && (
                <div
                  data-testid="avatar-expression-layer"
                  className={`absolute inset-0 pointer-events-none ${reducedMotion ? 'transition-none' : 'transition-opacity duration-300 ease-in-out'} opacity-100`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeExpressionUrl}
                    alt=""
                    aria-hidden="true"
                    onError={() => { setFailedExpressions((prev) => new Set(prev).add(activeExpressionUrl)); }}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Eyelid Blink Layer */}
              {!hasFullBody && blinkUrl && (
                <div
                  data-testid="avatar-blink-layer"
                  className={`absolute inset-0 pointer-events-none transition-opacity duration-75 ${isBlinking ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    maskImage: `radial-gradient(ellipse ${landmarks.eyeWidth} ${landmarks.eyeHeight} at ${landmarks.eyeX} ${landmarks.eyeY}, black 60%, transparent 100%)`,
                    WebkitMaskImage: `radial-gradient(ellipse ${landmarks.eyeWidth} ${landmarks.eyeHeight} at ${landmarks.eyeX} ${landmarks.eyeY}, black 60%, transparent 100%)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={blinkUrl} alt="" aria-hidden="true" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Speech Mouth Layer */}
              {!hasFullBody && speakUrl && activeSpeaking && (
                <div
                  data-testid="avatar-speak-layer"
                  className="absolute inset-0 pointer-events-none transition-opacity duration-75 ease-out"
                  style={{
                    opacity: Math.min(1.0, mouthIntensity * 1.15),
                    maskImage: `radial-gradient(ellipse ${landmarks.mouthWidth} ${landmarks.mouthHeight} at ${landmarks.mouthX} ${landmarks.mouthY}, black 65%, transparent 100%)`,
                    WebkitMaskImage: `radial-gradient(ellipse ${landmarks.mouthWidth} ${landmarks.mouthHeight} at ${landmarks.mouthX} ${landmarks.mouthY}, black 65%, transparent 100%)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={speakUrl} alt="" aria-hidden="true" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Depth-of-Field Lens Vignette (pulls eye to subject, blurs periphery) ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 72% at 50% 40%, transparent 52%, rgba(0,0,0,0.60) 100%)' }}
          aria-hidden="true"
        />

        {/* ── Cinematic Colour Grade ── */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 45%, rgba(0,0,0,0.3) 100%)',
            mixBlendMode: 'overlay',
          }}
          aria-hidden="true"
        />

        {/* ── Film Grain Noise (SVG data-URI, minimal memory) ── */}
        {!reducedMotion && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.032,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '180px 180px',
              mixBlendMode: 'overlay',
            }}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }

  // 2. Compact / Standalone Card Mode (Companion Switchers, Onboarding, Previews)
  return (
    <div
      className={`relative overflow-hidden rounded-3xl transition-all duration-300 flex items-center justify-center bg-[#0a0a0a] select-none ${stateAura} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Speaking soundwave ripple rings */}
      {activeSpeaking && !reducedMotion && (
        <div className="absolute inset-0 rounded-3xl border-2 border-violet-400/40 animate-ping pointer-events-none" />
      )}
      {/* Listening ambient perception ripples */}
      {isListening && !reducedMotion && (
        <div className="absolute inset-0 rounded-3xl border-2 border-emerald-400/40 animate-ping pointer-events-none" />
      )}

      {/* Unified Head Motion Container */}
      <div
        data-testid="avatar-head-container"
        className={`relative w-full h-full transform-gpu transition-transform duration-500 ease-out ${postureTransformClass}`}
        style={{
          animation: reducedMotion ? 'none' : 'ai-companion-breathe 6s ease-in-out infinite',
          transformOrigin: '50% 70%',
        }}
      >
        {/* Base Photorealistic Portrait */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={baseImgSrc}
          alt={name}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover select-none pointer-events-none"
        />

        {/* Expression Overlay Layer (subtle cross-fade over base portrait, falls back smoothly to base) */}
        {activeExpressionUrl && !failedExpressions.has(activeExpressionUrl) && (
          <div
            data-testid="avatar-expression-layer"
            className={`absolute inset-0 pointer-events-none ${
              reducedMotion ? 'transition-none' : 'transition-opacity duration-300 ease-in-out'
            } opacity-100`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeExpressionUrl}
              alt=""
              aria-hidden="true"
              onError={() => {
                setFailedExpressions((prev) => new Set(prev).add(activeExpressionUrl));
              }}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Natural Eyelid Blink Layer (feathered to eye region) */}
        {blinkUrl && (
          <div
            data-testid="avatar-blink-layer"
            className={`absolute inset-0 pointer-events-none transition-opacity duration-75 ${
              isBlinking ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              maskImage: `radial-gradient(ellipse ${landmarks.eyeWidth} ${landmarks.eyeHeight} at ${landmarks.eyeX} ${landmarks.eyeY}, black 60%, transparent 100%)`,
              WebkitMaskImage: `radial-gradient(ellipse ${landmarks.eyeWidth} ${landmarks.eyeHeight} at ${landmarks.eyeX} ${landmarks.eyeY}, black 60%, transparent 100%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={blinkUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Speech Mouth Layer (feathered to calibrated mouth landmark aperture) */}
        {speakUrl && activeSpeaking && (
          <div
            data-testid="avatar-speak-layer"
            className="absolute inset-0 pointer-events-none transition-opacity duration-75 ease-out"
            style={{
              opacity: Math.min(1.0, mouthIntensity * 1.15),
              maskImage: `radial-gradient(ellipse ${landmarks.mouthWidth} ${landmarks.mouthHeight} at ${landmarks.mouthX} ${landmarks.mouthY}, black 65%, transparent 100%)`,
              WebkitMaskImage: `radial-gradient(ellipse ${landmarks.mouthWidth} ${landmarks.mouthHeight} at ${landmarks.mouthX} ${landmarks.mouthY}, black 65%, transparent 100%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={speakUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
};
