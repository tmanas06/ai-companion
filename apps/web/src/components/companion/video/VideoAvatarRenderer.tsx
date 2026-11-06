'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AvatarInteractionState,
  AvatarEmotion,
  VideoAssetEntry,
  ARIA_VIDEO_MANIFEST,
  resolveCandidateClips,
  pickNextClip,
} from '@/lib/avatar-video-manifest';
import { CompanionVoiceState } from '../AvatarRenderer';

export interface VideoAvatarRendererProps {
  state: CompanionVoiceState;
  currentEmotion?: AvatarEmotion;
  emotionIntensity?: number;
  audioLevel?: number; // 0.0 to 1.0 from microphone or assistant speech audio
  isSpeaking?: boolean;
  className?: string;
  onError?: (err: Error) => void;
  onStateTransition?: (from: AvatarInteractionState, to: AvatarInteractionState) => void;
}

interface VideoLayerState {
  src: string;
  clipId: string;
  isLooping: boolean;
  opacity: number;
}

/**
 * Maps companion voice state to avatar interaction state.
 */
function mapVoiceStateToInteraction(state: CompanionVoiceState): AvatarInteractionState {
  switch (state) {
    case 'requesting_microphone':
    case 'listening':
      return 'listening';
    case 'processing_speech':
    case 'generating_response':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'error':
      return 'error';
    case 'interrupted':
    case 'idle':
    default:
      return 'idle';
  }
}

/**
 * Determine optimal container video format (H.264 MP4 vs VP9 WebM) based on browser codec support.
 */
function getPlayableVideoPath(clip: VideoAssetEntry): string {
  if (typeof document !== 'undefined') {
    try {
      const testVideo = document.createElement('video');
      const mp4Support = testVideo.canPlayType('video/mp4; codecs="avc1.42E01E"') || testVideo.canPlayType('video/mp4');
      if (!mp4Support && clip.webmPath) {
        return clip.webmPath;
      }
    } catch {
      // Browser environment check failed; use default path
    }
  }
  return clip.path;
}

export const VideoAvatarRenderer: React.FC<VideoAvatarRendererProps> = ({
  state: voiceState,
  currentEmotion = 'neutral',
  audioLevel = 0,
  isSpeaking = false,
  className = '',
  onError,
  onStateTransition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);

  // Active layer pointer: 'A' or 'B'
  const activeLayerRef = useRef<'A' | 'B'>('A');

  const [layerA, setLayerA] = useState<VideoLayerState>(() => {
    const defaultClip = ARIA_VIDEO_MANIFEST.assets[0];
    const initialSrc = defaultClip ? getPlayableVideoPath(defaultClip) : '/avatars/aria/idle/idle_01.mp4';
    return {
      src: initialSrc,
      clipId: defaultClip?.id || 'aria_idle_01',
      isLooping: true,
      opacity: 1,
    };
  });

  const [layerB, setLayerB] = useState<VideoLayerState>({
    src: '',
    clipId: '',
    isLooping: true,
    opacity: 0,
  });

  const currentClipRef = useRef<VideoAssetEntry | null>(null);
  const currentInteractionStateRef = useRef<AvatarInteractionState>('idle');
  const isTransitioningRef = useRef<boolean>(false);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derive interaction state
  const targetInteractionState = mapVoiceStateToInteraction(voiceState);

  /**
   * Seamless dual-layer crossfade to target clip.
   */
  const transitionToClip = useCallback(
    (nextClip: VideoAssetEntry) => {
      if (currentClipRef.current?.id === nextClip.id && !isTransitioningRef.current) {
        return; // Already playing this clip
      }

      const fromState = currentInteractionStateRef.current;
      currentInteractionStateRef.current = nextClip.state;
      currentClipRef.current = nextClip;
      onStateTransition?.(fromState, nextClip.state);

      const currentActive = activeLayerRef.current;
      const nextActive: 'A' | 'B' = currentActive === 'A' ? 'B' : 'A';
      const targetVideo = nextActive === 'A' ? videoRefA.current : videoRefB.current;
      const outgoingVideo = currentActive === 'A' ? videoRefA.current : videoRefB.current;

      if (!targetVideo) return;

      isTransitioningRef.current = true;

      const playableSrc = getPlayableVideoPath(nextClip);

      // Update incoming layer src and looping property
      if (nextActive === 'A') {
        setLayerA({
          src: playableSrc,
          clipId: nextClip.id,
          isLooping: nextClip.isLoopable,
          opacity: 0,
        });
      } else {
        setLayerB({
          src: playableSrc,
          clipId: nextClip.id,
          isLooping: nextClip.isLoopable,
          opacity: 0,
        });
      }

      targetVideo.src = playableSrc;
      targetVideo.loop = nextClip.isLoopable;
      targetVideo.currentTime = 0;
      targetVideo.muted = true; // Ensure browser autoplay policy allows silent avatar loop

      const playPromise = targetVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Initiate crossfade
            activeLayerRef.current = nextActive;

            if (nextActive === 'A') {
              setLayerA((prev) => ({ ...prev, opacity: 1 }));
              setLayerB((prev) => ({ ...prev, opacity: 0 }));
            } else {
              setLayerB((prev) => ({ ...prev, opacity: 1 }));
              setLayerA((prev) => ({ ...prev, opacity: 0 }));
            }

            if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = setTimeout(() => {
              if (outgoingVideo) {
                outgoingVideo.pause();
              }
              isTransitioningRef.current = false;
            }, 350); // 350ms crossfade duration
          })
          .catch((err: unknown) => {
            isTransitioningRef.current = false;
            const errorObj = err as { name?: string; message?: string } | null;
            // Transient interruption errors when switching clips are normal and harmless
            if (errorObj?.name === 'AbortError' || errorObj?.name === 'NotAllowedError') {
              return;
            }
            console.warn('[VideoAvatar] Video play error:', err);
            onError?.(err instanceof Error ? err : new Error(String(err)));
          });
      }
    },
    [onError, onStateTransition]
  );

  /**
   * Monitor voice state and emotion changes to select matching video clip.
   */
  useEffect(() => {
    const targetEmotion = currentEmotion;
    let targetState = targetInteractionState;

    // If an emotional reaction is active during speaking or response
    if (currentEmotion !== 'neutral' && targetState !== 'listening' && targetState !== 'thinking') {
      const candidates = resolveCandidateClips(ARIA_VIDEO_MANIFEST, 'reaction', targetEmotion);
      if (candidates.length > 0 && targetState !== 'speaking') {
        targetState = 'reaction';
      }
    }

    const candidates = resolveCandidateClips(ARIA_VIDEO_MANIFEST, targetState, targetEmotion);
    if (candidates.length > 0) {
      const nextClip = pickNextClip(candidates, currentClipRef.current?.id);
      transitionToClip(nextClip);
    }
  }, [targetInteractionState, currentEmotion, transitionToClip]);

  /**
   * Handle one-shot clip completion (return to idle or listening).
   */
  const handleClipEnded = useCallback(
    (layer: 'A' | 'B') => {
      if (activeLayerRef.current !== layer) return;
      const current = currentClipRef.current;
      if (!current || current.isLoopable) return;

      // One-shot clip ended, transition to base state
      const nextState: AvatarInteractionState = isSpeaking ? 'speaking' : targetInteractionState;
      const candidates = resolveCandidateClips(ARIA_VIDEO_MANIFEST, nextState, 'neutral');
      if (candidates.length > 0) {
        const nextClip = pickNextClip(candidates);
        transitionToClip(nextClip);
      }
    },
    [isSpeaking, targetInteractionState, transitionToClip]
  );

  // Resource cleanup on unmount
  useEffect(() => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (vA) {
        vA.pause();
        vA.src = '';
      }
      if (vB) {
        vB.pause();
        vB.src = '';
      }
    };
  }, []);

  // Subtle real-time audio lip modulation during active speech
  const dynamicMouthScale = isSpeaking && audioLevel > 0.04 ? Math.min(1.08, 1.0 + audioLevel * 0.12) : 1.0;

  // Dynamically synchronize speaking video rate with real-time speech energy
  useEffect(() => {
    const activeVideo = activeLayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
    if (!activeVideo) return;

    if (isSpeaking) {
      if (audioLevel > 0.035) {
        // Voice is actively producing speech sound: play smoothly
        if (activeVideo.paused) {
          activeVideo.play().catch(() => {});
        }
        activeVideo.playbackRate = Math.min(1.2, Math.max(0.85, 0.9 + audioLevel * 0.35));
      } else {
        // Natural pause between words or sentences: slow down to near-pause to avoid mouth flapping in silence
        activeVideo.playbackRate = 0.2;
      }
    } else {
      activeVideo.playbackRate = 1.0;
    }
  }, [isSpeaking, audioLevel]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-950 select-none ${className}`}
      data-testid="video-avatar-container"
    >
      {/* Ambient Bokeh Backdrop: smooth studio illumination behind the portrait */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-950/20 via-slate-950/80 to-slate-950" />

      {/* Main High-Definition Portrait Frame (Maintains 1:1 bust framing without zooming into the nose) */}
      <div className="relative h-full aspect-square max-h-[85vh] max-w-full flex items-center justify-center overflow-hidden shadow-2xl rounded-2xl sm:rounded-3xl border border-slate-800/40">
        {/* Layer A Video Element */}
        <video
          ref={videoRefA}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ease-in-out"
          style={{
            opacity: layerA.opacity,
            transform: isSpeaking ? `scale(${dynamicMouthScale})` : 'scale(1)',
            transformOrigin: '50% 58%',
            transition: 'opacity 350ms ease-in-out, transform 80ms ease-out',
          }}
          src={layerA.src || undefined}
          muted
          playsInline
          autoPlay
          loop={layerA.isLooping}
          onEnded={() => handleClipEnded('A')}
          onError={(e) => {
            if (!layerA.src) return;
            if (layerA.src.endsWith('.mp4')) {
              const webmFallback = layerA.src.replace(/\.mp4$/, '.webm');
              console.info('[VideoAvatar] MP4 playback failed in current browser, attempting WebM fallback:', webmFallback);
              setLayerA((prev) => ({ ...prev, src: webmFallback }));
              return;
            }
            console.warn('[VideoAvatar] Layer A error:', e);
            onError?.(new Error('Video Layer A playback failed'));
          }}
        />

        {/* Layer B Video Element */}
        <video
          ref={videoRefB}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ease-in-out"
          style={{
            opacity: layerB.opacity,
            transform: isSpeaking ? `scale(${dynamicMouthScale})` : 'scale(1)',
            transformOrigin: '50% 58%',
            transition: 'opacity 350ms ease-in-out, transform 80ms ease-out',
          }}
          src={layerB.src || undefined}
          muted
          playsInline
          autoPlay
          loop={layerB.isLooping}
          onEnded={() => handleClipEnded('B')}
          onError={(e) => {
            if (!layerB.src) return;
            if (layerB.src.endsWith('.mp4')) {
              const webmFallback = layerB.src.replace(/\.mp4$/, '.webm');
              console.info('[VideoAvatar] MP4 playback failed in current browser, attempting WebM fallback:', webmFallback);
              setLayerB((prev) => ({ ...prev, src: webmFallback }));
              return;
            }
            console.warn('[VideoAvatar] Layer B error:', e);
            onError?.(new Error('Video Layer B playback failed'));
          }}
        />

        {/* Ambient Vignette & Depth Mask inside portrait frame */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/20" />
      </div>

      {/* State / Emotion Pill Indicator (Unobtrusive) */}
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-950/60 backdrop-blur-md border border-slate-800 text-[10px] text-slate-300 font-medium">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isSpeaking
              ? 'bg-violet-400 animate-pulse'
              : targetInteractionState === 'listening'
              ? 'bg-emerald-400 animate-ping'
              : targetInteractionState === 'thinking'
              ? 'bg-amber-400 animate-pulse'
              : 'bg-slate-400'
          }`}
        />
        <span className="capitalize">{targetInteractionState}</span>
        {currentEmotion !== 'neutral' && (
          <span className="text-violet-400 font-semibold">• {currentEmotion}</span>
        )}
      </div>
    </div>
  );
};
