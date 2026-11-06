'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { CompanionVoiceState } from '@/components/companion/AvatarRenderer';
import {
  selectVoiceForCompanion,
  getCompanionVoiceProfile,
  isVoiceMatchingGender,
} from '@/lib/voice-manager';
import { validateAvatarEmotion } from '@/lib/emotion-selector';
import { AvatarEmotion } from '@/lib/avatar-video-manifest';

export interface VoiceSettings {
  speechRate: number;
  pitch: number;
  ttsEngine: 'backend' | 'browser';
  voiceName?: string;
}

interface UseLiveVoiceCompanionOptions {
  companionId?: string;
  conversationId?: string | null;
  companionGender?: 'male' | 'female';
  companionName?: string;
  autoGreet?: boolean;
  onConversationCreated?: (newId: string) => void;
  onError?: (err: string) => void;
}

function loadCompanionVoiceSettings(
  id?: string,
  name?: string,
  gender: 'male' | 'female' = 'female'
): VoiceSettings {
  const profile = getCompanionVoiceProfile(name, gender);
  const defaultVoice = profile.elevenLabsVoice || (gender === 'male' ? 'pNInz6obpgDQGcFmaJgB' : '21m00Tcm4TlvDq8ikWAM');

  if (typeof window !== 'undefined') {
    try {
      if (id) {
        const saved = localStorage.getItem(`ai_companion_voice_${id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          const rawVoice = parsed.voiceName;
          const validVoice = isVoiceMatchingGender(rawVoice, gender) ? rawVoice : defaultVoice;
          return {
            speechRate: typeof parsed.speechRate === 'number' ? parsed.speechRate : profile.speechRate,
            pitch: typeof parsed.pitch === 'number' ? parsed.pitch : profile.pitch,
            ttsEngine: 'backend',
            voiceName: validVoice,
          };
        }
      }
      const generic = localStorage.getItem('ai_companion_voice_settings');
      if (generic) {
        const parsed = JSON.parse(generic);
        const rawVoice = parsed.voiceName;
        const validVoice = isVoiceMatchingGender(rawVoice, gender) ? rawVoice : defaultVoice;
        return {
          speechRate: typeof parsed.speechRate === 'number' ? parsed.speechRate : profile.speechRate,
          pitch: typeof parsed.pitch === 'number' ? parsed.pitch : profile.pitch,
          ttsEngine: 'backend',
          voiceName: validVoice,
        };
      }
    } catch (e) {
      // Ignored
    }
  }
  return {
    speechRate: profile.speechRate,
    pitch: profile.pitch,
    ttsEngine: 'backend',
    voiceName: defaultVoice,
  };
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface BrowserSpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function useLiveVoiceCompanion({
  companionId,
  conversationId,
  companionGender = 'female',
  companionName,
  autoGreet = true,
  onConversationCreated,
  onError,
}: UseLiveVoiceCompanionOptions) {
  const [state, setState] = useState<CompanionVoiceState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [lastCompanionSpeech, setLastCompanionSpeech] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const pendingAudioPlaybackRef = useRef<(() => void) | null>(null);
  const hasGreetedCompanionRef = useRef<string | null>(null);
  const [voiceSettings, setVoiceSettingsState] = useState<VoiceSettings>(() =>
    loadCompanionVoiceSettings(companionId, companionName, companionGender)
  );
  const [currentEmotion, setCurrentEmotion] = useState<AvatarEmotion>('neutral');
  const [emotionIntensity, setEmotionIntensity] = useState<number>(0.5);
  const [sadtalkerVideoUrl, setSadtalkerVideoUrl] = useState<string | null>(null);

  const activeSadTalkerJobIdRef = useRef<string | null>(null);
  const sadTalkerPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cancelActiveSadTalkerJob = useCallback(() => {
    if (sadTalkerPollTimerRef.current) {
      clearTimeout(sadTalkerPollTimerRef.current);
      sadTalkerPollTimerRef.current = null;
    }
    const activeJobId = activeSadTalkerJobIdRef.current;
    if (activeJobId) {
      activeSadTalkerJobIdRef.current = null;
      fetch(`/api/sadtalker/jobs/${activeJobId}`, { method: 'DELETE' }).catch(() => {});
    }
  }, []);

  const handleSadTalkerJob = useCallback(
    (jobId: string, sessionId: number) => {
      cancelActiveSadTalkerJob();
      activeSadTalkerJobIdRef.current = jobId;

      const poll = async () => {
        if (activeSadTalkerJobIdRef.current !== jobId || sessionId !== activeSessionIdRef.current) {
          return;
        }
        try {
          const res = await fetch(`/api/sadtalker/jobs/${jobId}`);
          if (!res.ok) return;
          const info = await res.json();
          if (activeSadTalkerJobIdRef.current !== jobId || sessionId !== activeSessionIdRef.current) {
            return;
          }
          if (info.status === 'completed' && info.video_url) {
            setSadtalkerVideoUrl(info.video_url);
            activeSadTalkerJobIdRef.current = null;
          } else if (info.status === 'failed' || info.status === 'cancelled') {
            activeSadTalkerJobIdRef.current = null;
          } else {
            // Check status periodically while job is rendering in background
            sadTalkerPollTimerRef.current = setTimeout(poll, 3000);
          }
        } catch {
          // Polling will gracefully cease on network failure
        }
      };

      sadTalkerPollTimerRef.current = setTimeout(poll, 2500);
    },
    [cancelActiveSadTalkerJob]
  );

  const [handsFree, setHandsFreeState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('ai_companion_hands_free_mode');
        if (saved !== null) {
          return saved === 'true';
        }
      } catch (e) {
        // Ignored
      }
    }
    return true;
  });
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);

  const handsFreeRef = useRef<boolean>(handsFree);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const stateRef = useRef<CompanionVoiceState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setHandsFree = useCallback((enabled: boolean) => {
    setHandsFreeState(enabled);
    handsFreeRef.current = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_companion_hands_free_mode', String(enabled));
      } catch (e) {
        // Ignored
      }
    }
  }, []);

  const toggleHandsFree = useCallback(() => {
    setHandsFreeState((prev) => {
      const next = !prev;
      handsFreeRef.current = next;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('ai_companion_hands_free_mode', String(next));
        } catch (e) {
          // Ignored
        }
      }
      return next;
    });
  }, []);

  // Sync settings whenever active companion or gender changes
  useEffect(() => {
    setVoiceSettingsState(loadCompanionVoiceSettings(companionId, companionName, companionGender));
  }, [companionId, companionName, companionGender]);

  const setVoiceSettings = useCallback((newSettings: VoiceSettings) => {
    const sanitized: VoiceSettings = {
      ...newSettings,
      ttsEngine: 'backend',
    };
    setVoiceSettingsState(sanitized);
    if (typeof window !== 'undefined') {
      try {
        if (companionId) {
          localStorage.setItem(`ai_companion_voice_${companionId}`, JSON.stringify(sanitized));
        }
      } catch (e) {
        // Ignored
      }
    }
  }, [companionId]);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      try {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          setAvailableVoices(v);
        }
      } catch (e) {
        // Ignored
      }
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<number>(0);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playbackAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const playbackAnimFrameRef = useRef<number | null>(null);
  const latestAlignmentRef = useRef<{ words: string[]; word_start_times_seconds: number[]; word_end_times_seconds: number[] } | null>(null);

  // VAD & Hands-Free conversation state tracking
  const hasUserSpokenRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const isUserSpeakingRef = useRef<boolean>(false);
  const listenStartTimeRef = useRef<number>(0);
  const noiseFloorSamplesRef = useRef<number[]>([]);
  const autoListenTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stopListeningRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const liveTranscriptRef = useRef<string>('');
  const speechRecognitionRef = useRef<BrowserSpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInterruptedRef = useRef<boolean>(false);

  // Stop and clean up microphone stream and analysis
  const cleanupMicrophone = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // Ignored
      }
      audioContextRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (e) {
        // Ignored
      }
      speechRecognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    hasUserSpokenRef.current = false;
    speechStartTimeRef.current = 0;
    lastSpeechTimeRef.current = 0;
    isUserSpeakingRef.current = false;
    setIsUserSpeaking(false);
    noiseFloorSamplesRef.current = [];
  }, []);

  // Stop real-time audio playback amplitude monitoring with resource cleanup
  const stopPlaybackMonitoring = useCallback(() => {
    if (playbackAnimFrameRef.current !== null) {
      cancelAnimationFrame(playbackAnimFrameRef.current);
      playbackAnimFrameRef.current = null;
    }
    if (playbackSourceNodeRef.current) {
      try {
        playbackSourceNodeRef.current.disconnect();
      } catch {
        // Ignored
      }
      playbackSourceNodeRef.current = null;
    }
    if (playbackAnalyserNodeRef.current) {
      try {
        playbackAnalyserNodeRef.current.disconnect();
      } catch {
        // Ignored
      }
      playbackAnalyserNodeRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Start real-time speech amplitude monitoring connected to Web Audio API
  const startPlaybackMonitoring = useCallback((audioEl: HTMLAudioElement, sessId: number) => {
    stopPlaybackMonitoring();
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
          playbackAudioContextRef.current = new AudioCtx();
        }
        const ctx = playbackAudioContextRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        playbackSourceNodeRef.current = source;
        playbackAnalyserNodeRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const loop = () => {
          if (sessId !== activeSessionIdRef.current || audioEl.paused || audioEl.ended) {
            stopPlaybackMonitoring();
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          const bins = Math.min(bufferLength, 28);
          for (let i = 2; i < bins; i++) {
            sum += dataArray[i] ?? 0;
          }
          const avg = sum / (bins - 2);
          const level = Math.min(1.0, Math.max(0.0, avg / 115));
          setAudioLevel(level);

          playbackAnimFrameRef.current = requestAnimationFrame(loop);
        };

        playbackAnimFrameRef.current = requestAnimationFrame(loop);
        return;
      }
    } catch {
      // Fallback: speech syllable modulation based on active playback time
      const startTime = Date.now();
      const fallbackLoop = () => {
        if (sessId !== activeSessionIdRef.current || audioEl.paused || audioEl.ended) {
          stopPlaybackMonitoring();
          return;
        }
        const t = (Date.now() - startTime) / 1000;
        const rhythm = Math.max(0, Math.sin(t * 11) * 0.45 + Math.sin(t * 19) * 0.25 + 0.3);
        setAudioLevel(rhythm);
        playbackAnimFrameRef.current = requestAnimationFrame(fallbackLoop);
      };
      playbackAnimFrameRef.current = requestAnimationFrame(fallbackLoop);
    }
  }, [stopPlaybackMonitoring]);

  // Monitor audio amplitude for animated visualizer/mouth & voice activity detection (VAD)
  const monitorAudioLevels = useCallback((analyser: AnalyserNode) => {
    const timeDomainData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    noiseFloorSamplesRef.current = [];

    const update = () => {
      // 1. Time-domain RMS: true acoustic amplitude regardless of frequency
      analyser.getByteTimeDomainData(timeDomainData);
      let sumSquares = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const deviation = ((timeDomainData[i] ?? 128) - 128) / 128.0;
        sumSquares += deviation * deviation;
      }
      const rms = Math.sqrt(sumSquares / timeDomainData.length);

      // 2. Frequency-domain speech band energy (first 8 bins focus on fundamental speech 100-3000Hz)
      analyser.getByteFrequencyData(freqData);
      let voiceBandSum = 0;
      const voiceBins = Math.min(8, freqData.length);
      for (let i = 0; i < voiceBins; i++) {
        voiceBandSum += freqData[i] ?? 0;
      }
      const voiceBandAvg = voiceBins > 0 ? (voiceBandSum / voiceBins) / 255.0 : 0;

      // 3. Composite speech energy
      const energy = Math.max(rms * 2.8, voiceBandAvg * 1.4);
      const normalizedForVisualizer = Math.min(1.0, energy * 2.0);
      setAudioLevel(normalizedForVisualizer);

      // Free-flow hands-free Voice Activity Detection (VAD)
      if (handsFreeRef.current && stateRef.current === 'listening') {
        const now = Date.now();

        // Sample initial ambient noise floor across first 20 frames (~300ms)
        if (noiseFloorSamplesRef.current.length < 20) {
          noiseFloorSamplesRef.current.push(energy);
        }

        const ambientAvg =
          noiseFloorSamplesRef.current.length > 0
            ? noiseFloorSamplesRef.current.reduce((a, b) => a + b, 0) / noiseFloorSamplesRef.current.length
            : 0.015;
        const noiseFloor = Math.min(0.045, Math.max(0.008, ambientAvg));
        const speechThreshold = Math.max(0.024, noiseFloor * 1.5 + 0.010);

        if (energy >= speechThreshold) {
          if (!hasUserSpokenRef.current) {
            hasUserSpokenRef.current = true;
            speechStartTimeRef.current = now;
          }
          lastSpeechTimeRef.current = now;
          if (!isUserSpeakingRef.current) {
            isUserSpeakingRef.current = true;
            setIsUserSpeaking(true);
          }
        } else {
          // Level is below speech threshold (natural pause or silence)
          if (isUserSpeakingRef.current && now - lastSpeechTimeRef.current > 250) {
            isUserSpeakingRef.current = false;
            setIsUserSpeaking(false);
          }

          // Check if speech has ended and natural silence duration (1200ms) has elapsed
          if (
            hasUserSpokenRef.current &&
            now - speechStartTimeRef.current >= 350 &&
            now - lastSpeechTimeRef.current >= 1200
          ) {
            // User finished speaking! Automatically stop listening and submit voice turn
            stopListeningRef.current();
            return;
          }
        }

        // Safety maximum turn limit: if user has spoken and 12s total speech elapsed, auto-finalize turn
        if (hasUserSpokenRef.current && now - speechStartTimeRef.current >= 12000) {
          stopListeningRef.current();
          return;
        }

        // Idle timeout: if 30s elapsed in listening with zero speech, revert to idle to conserve battery
        if (!hasUserSpokenRef.current && now - listenStartTimeRef.current > 30000) {
          cleanupMicrophone();
          setState('idle');
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, [cleanupMicrophone]);

  // Immediate Interruption handler
  const interrupt = useCallback(() => {
    isInterruptedRef.current = true;
    // 0. Cancel any scheduled auto-listen
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }

    // 1. Invalidate current session token so stale responses cannot play
    activeSessionIdRef.current += 1;

    // 2. Abort pending network fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 3. Stop currently playing audio
    stopPlaybackMonitoring();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }

    // 4. Cancel browser speech synthesis if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      activeUtteranceRef.current = null;
    }

    // 5. Cleanup microphone if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignored
      }
    }
    cleanupMicrophone();

    // 6. Cancel active SadTalker inference job
    cancelActiveSadTalkerJob();
    setSadtalkerVideoUrl(null);
    latestAlignmentRef.current = null;

    // 7. Explicit state transition
    setState('interrupted');
    setTimeout(() => {
      setState((prev) => (prev === 'interrupted' ? 'idle' : prev));
    }, 700);
  }, [cleanupMicrophone, stopPlaybackMonitoring, cancelActiveSadTalkerJob]);

  // Browser speech synthesis disabled to prevent distorted metallic/espeak voices
  const playBrowserSpeech = useCallback(
    (_text: string, _sessionId: number) => {
      console.warn('[LiveVoice] Browser speech synthesis is disabled. Studio AI voices are enforced.');
      setState('idle');
    },
    []
  );

  // Play assistant audio response with amplitude monitoring
  const playAssistantAudio = useCallback(
    async (audioBase64: string, _fallbackText: string, sessionId: number, audioFormat?: string) => {
      if (sessionId !== activeSessionIdRef.current) {
        return; // Session cancelled/interrupted
      }

      let audio: HTMLAudioElement | null = null;
      try {
        // Convert base64 to audio object
        const mime = audioFormat && audioFormat.includes('/') ? audioFormat : `audio/${audioFormat || 'mpeg'}`;
        const audioSrc = `data:${mime};base64,${audioBase64}`;
        audio = new Audio(audioSrc);
        activeAudioRef.current = audio;

        // Try setting playback rate
        audio.preservesPitch = true;
        audio.playbackRate = voiceSettings.speechRate;

        // Only transition to 'speaking' when audio actually starts playback
        audio.onplay = () => {
          if (sessionId === activeSessionIdRef.current) {
            setState('speaking');
            setErrorMessage(null);
            if (audio) {
              startPlaybackMonitoring(audio, sessionId);
            }
          } else {
            audio?.pause();
          }
        };

        audio.onended = () => {
          stopPlaybackMonitoring();
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setAudioLevel(0);
            if (handsFreeRef.current) {
              if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
              autoListenTimerRef.current = setTimeout(() => {
                if (sessionId === activeSessionIdRef.current && stateRef.current === 'idle' && handsFreeRef.current) {
                  startListeningRef.current();
                }
              }, 450);
            }
          }
          activeAudioRef.current = null;
        };

        audio.onerror = () => {
          stopPlaybackMonitoring();
          console.error('[LiveVoice] Assistant audio playback failed');
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setErrorMessage('Unable to play companion audio');
          }
        };

        await audio.play();
        setAutoplayBlocked(false);
      } catch (e: unknown) {
        const err = e as { name?: string } | null;
        if (err?.name === 'NotAllowedError') {
          // Autoplay restricted by browser policy without user gesture
          setAutoplayBlocked(true);
          pendingAudioPlaybackRef.current = () => {
            if (audio) {
              audio.play().catch((playErr) => console.error('[LiveVoice] Play blocked:', playErr));
            }
          };
          if (sessionId === activeSessionIdRef.current) {
            setState('speaking');
            setTimeout(() => {
              if (sessionId === activeSessionIdRef.current) {
                setState((prev) => (prev === 'speaking' ? 'idle' : prev));
              }
            }, 3500);
          }
        } else {
          console.error('[LiveVoice] Audio playback failed:', e);
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setErrorMessage('Audio playback failed');
          }
        }
      }
    },
    [voiceSettings, startPlaybackMonitoring, stopPlaybackMonitoring]
  );

  // Submit audio to backend voice turn orchestration
  const submitVoiceTurn = useCallback(
    async (audioBlob: Blob, textQuery?: string) => {
      if (!companionId) {
        setErrorMessage('Please select an active companion first');
        setState('error');
        return;
      }

      const currentSessionId = ++activeSessionIdRef.current;
      setState('generating_response');
      setErrorMessage(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const formData = new FormData();
        formData.append('companion_id', companionId);
        if (conversationId) {
          formData.append('conversation_id', conversationId);
        }
        if (textQuery) {
          formData.append('text', textQuery);
        }
        if (audioBlob && audioBlob.size > 0) {
          const filename = audioBlob.type.includes('webm') ? 'mic_input.webm' : 'mic_input.wav';
          formData.append('audio_file', audioBlob, filename);
        }
        if (voiceSettings.voiceName) {
          formData.append('voice', voiceSettings.voiceName);
        }

        const res = await fetch('/api/voice/turn', {
          method: 'POST',
          signal: controller.signal,
          body: formData,
        });

        if (currentSessionId !== activeSessionIdRef.current) {
          return; // Interrupted
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Voice turn request failed');
        }

        const data = await res.json();

        // Notify parent of newly created conversation
        if (data.conversation_id && onConversationCreated) {
          onConversationCreated(data.conversation_id);
        }

        const replyText = data.response_text || data.reply_text || '';
        const transcriptText = data.user_transcript || data.transcript || textQuery || '';

        setTranscript(transcriptText);
        setLastCompanionSpeech(replyText);
        setErrorMessage(null);

        // Extract and validate emotional tone for avatar rendering
        const detectedEmotion = validateAvatarEmotion(data.emotion);
        setCurrentEmotion(detectedEmotion);
        setEmotionIntensity(typeof data.emotion_intensity === 'number' ? data.emotion_intensity : 0.5);

        // Check for background SadTalker lip-sync video generation job
        if (data.sadtalker_job_id) {
          handleSadTalkerJob(data.sadtalker_job_id, currentSessionId);
        }

        // Play companion response via high-fidelity neural audio
        if (data.audio_base64) {
          playAssistantAudio(data.audio_base64, replyText, currentSessionId, data.audio_format || 'audio/mpeg');
        } else {
          setState('idle');
        }
      } catch (err: unknown) {
        console.error('[LiveVoice] submitVoiceTurn error:', err);
        const errorObj = err as { name?: string; message?: string } | null;
        if (
          errorObj?.name === 'AbortError' ||
          controller.signal.aborted ||
          currentSessionId !== activeSessionIdRef.current ||
          stateRef.current === 'interrupted' ||
          errorObj?.message?.toLowerCase().includes('abort') ||
          errorObj?.message?.toLowerCase().includes('cancel')
        ) {
          return; // Interrupted gracefully, do not display error banner
        }

        const msg = errorObj?.message || 'Failed to communicate with companion';
        if (
          msg.includes('No speech detected') ||
          msg.toLowerCase().includes('no speech') ||
          msg.includes('Audio data is empty')
        ) {
          // Ambient silence or quick tap without speaking: gracefully return to idle/listen without error banner
          setState('idle');
          if (handsFreeRef.current) {
            if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
            autoListenTimerRef.current = setTimeout(() => {
              if (currentSessionId === activeSessionIdRef.current && stateRef.current === 'idle' && handsFreeRef.current) {
                startListeningRef.current();
              }
            }, 600);
          }
          return;
        }

        let displayMsg = msg;
        if (msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
          displayMsg = 'Connection to the companion was interrupted. Tap the mic to try again.';
        } else if (msg.includes('Not authenticated') || msg.includes('Invalid token') || msg.includes('credentials')) {
          displayMsg = 'Session expired. Please refresh the page to continue.';
        }
        setErrorMessage(displayMsg);
        setState('error');
        if (onError) onError(displayMsg);
      }
    },
    [companionId, conversationId, onConversationCreated, onError, playAssistantAudio, playBrowserSpeech, voiceSettings, handleSadTalkerJob]
  );

  // Start microphone capture
  const startListening = useCallback(async () => {
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }

    // Cancel any stale opening greeting so it doesn't speak over the user
    pendingAudioPlaybackRef.current = null;

    // Prevent overlapping sessions
    if (state === 'speaking' || state === 'generating_response' || state === 'processing_speech') {
      interrupt();
    }

    isInterruptedRef.current = false;
    setErrorMessage(null);
    setState('requesting_microphone');
    setTranscript('');
    audioChunksRef.current = [];
    hasUserSpokenRef.current = false;
    speechStartTimeRef.current = 0;
    lastSpeechTimeRef.current = 0;
    isUserSpeakingRef.current = false;
    setIsUserSpeaking(false);
    listenStartTimeRef.current = Date.now();
    noiseFloorSamplesRef.current = [];
    liveTranscriptRef.current = '';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support microphone capture');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Verify active capture stream before updating state
      if (!stream.active) {
        throw new Error('Microphone stream is not active');
      }

      mediaStreamRef.current = stream;

      // Setup audio analysis for visualizer
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.25;
        source.connect(analyser);
        analyserRef.current = analyser;
        monitorAudioLevels(analyser);
      } catch (e) {
        // Visualizer fallback
      }

      // Initialize Web Speech API if supported by browser for real-time speech transcription
      if (typeof window !== 'undefined') {
        const SpeechRec =
          (window as unknown as {
            SpeechRecognition?: new () => BrowserSpeechRecognitionLike;
            webkitSpeechRecognition?: new () => BrowserSpeechRecognitionLike;
          }).SpeechRecognition ||
          (window as unknown as {
            SpeechRecognition?: new () => BrowserSpeechRecognitionLike;
            webkitSpeechRecognition?: new () => BrowserSpeechRecognitionLike;
          }).webkitSpeechRecognition;

        if (SpeechRec) {
          try {
            const rec = new SpeechRec();
            rec.continuous = true;
            rec.interimResults = true;
            rec.lang = 'en-US';

            rec.onresult = (event: SpeechRecognitionEventLike) => {
              let text = '';
              for (let i = 0; i < event.results.length; i++) {
                const item = event.results[i]?.[0];
                if (item) {
                  text += item.transcript;
                }
              }
              if (text.trim()) {
                liveTranscriptRef.current = text.trim();
                setTranscript(text.trim());
                hasUserSpokenRef.current = true;
                lastSpeechTimeRef.current = Date.now();
                if (speechStartTimeRef.current === 0) {
                  speechStartTimeRef.current = Date.now();
                }
                setIsUserSpeaking(true);
              }
            };

            rec.onspeechend = () => {
              if (handsFreeRef.current && hasUserSpokenRef.current) {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                  if (stateRef.current === 'listening') {
                    stopListeningRef.current();
                  }
                }, 900);
              }
            };

            rec.onerror = () => {
              // Non-blocking fallback to backend faster-whisper
            };

            rec.start();
            speechRecognitionRef.current = rec;
          } catch (e) {
            // Non-blocking fallback
          }
        }
      }

      // Initialize MediaRecorder
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = '';
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/wav' });
        const recognizedText = liveTranscriptRef.current || undefined;
        cleanupMicrophone();

        if (isInterruptedRef.current || stateRef.current === 'interrupted') {
          return;
        }

        if (blob.size === 0 && !recognizedText) {
          setState('idle');
          return;
        }

        setState('processing_speech');
        submitVoiceTurn(blob, recognizedText);
      };

      recorder.start(100);

      // Only enter 'listening' state once the recorder and stream are active!
      setState('listening');
    } catch (err: unknown) {
      cleanupMicrophone();
      const errorObj = err as { name?: string; message?: string } | null;
      let msg = 'Failed to access microphone';
      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        msg = 'Microphone permission was denied. Please allow microphone access in your browser.';
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        msg = 'No microphone device was detected on your system.';
      } else if (errorObj?.message) {
        msg = errorObj.message;
      }
      setErrorMessage(msg);
      setState('error');
      if (onError) onError(msg);
    }
  }, [cleanupMicrophone, interrupt, monitorAudioLevels, onError, state, submitVoiceTurn]);

  // Stop microphone capture and submit
  const stopListening = useCallback(() => {
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Guard: Only process stopping when actively listening or requesting mic
    if (stateRef.current !== 'listening' && stateRef.current !== 'requesting_microphone') {
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        setState('processing_speech');
        mediaRecorderRef.current.stop();
      } catch (e) {
        cleanupMicrophone();
        setState('idle');
      }
    } else {
      cleanupMicrophone();
      if (stateRef.current === 'listening') {
        setState('idle');
      }
    }
  }, [cleanupMicrophone]);

  // Direct text submission (for testing or accessibility)
  const submitText = useCallback(
    async (text: string) => {
      if (!text || !text.trim()) return;
      interrupt();
      const emptyBlob = new Blob([], { type: 'audio/wav' });
      await submitVoiceTurn(emptyBlob, text.trim());
    },
    [interrupt, submitVoiceTurn]
  );

  // Replay last speech response using high-fidelity studio audio
  const replaySpeech = useCallback(async () => {
    if (!lastCompanionSpeech) return;
    const currentSessionId = ++activeSessionIdRef.current;
    setState('generating_response');
    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: lastCompanionSpeech,
          voice: voiceSettings.voiceName,
          speed: voiceSettings.speechRate,
        }),
      });
      if (!res.ok) throw new Error('Replay synthesis failed');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string)?.split(',')[1];
        if (base64) {
          playAssistantAudio(base64, lastCompanionSpeech, currentSessionId, 'audio/mpeg');
        } else {
          setState('idle');
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error('[LiveVoice] replaySpeech error:', e);
      setState('idle');
    }
  }, [lastCompanionSpeech, voiceSettings, playAssistantAudio]);

  // Proactively trigger companion opening greeting before user speaks
  const triggerGreeting = useCallback(
    async (options?: { force?: boolean }) => {
      if (!companionId) return;

      if (!options?.force && hasGreetedCompanionRef.current === companionId) {
        return;
      }
      hasGreetedCompanionRef.current = companionId;

      const currentSessionId = ++activeSessionIdRef.current;
      setState('generating_response');
      setErrorMessage(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const ARCHETYPE_GREETINGS: Record<string, string> = {
        aria: "Hello! It's so wonderful to see you. How are you feeling today?",
        marcus: "Hello. Great to connect with you. What would you like to focus on today?",
        luna: "Hey there! I'm so excited to chat with you today. What's on your mind?",
        kai: "Hey! Awesome to meet you. What exciting things are going on today?",
        nova: "Greetings! It's fantastic to connect. What big ideas are we exploring today?",
        atlas: "Welcome! I'm glad you're here. Let me know what you'd like to work on together.",
        sage: "Hello. It's peaceful to be here with you. Take your time, what would you like to reflect on?",
        maya: "Hi! It's wonderful to meet you. I'm all ears—how can I brighten your day?",
      };

      const fallbackText =
        (companionName && ARCHETYPE_GREETINGS[companionName.toLowerCase().trim()]) ||
        `Hello! I'm ${companionName || 'your companion'}. It's so wonderful to meet you. How are you doing today?`;

      try {
        const res = await fetch('/api/voice/greeting', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companion_id: companionId,
            conversation_id: conversationId || undefined,
            voice: voiceSettings.voiceName,
          }),
        });

        if (currentSessionId !== activeSessionIdRef.current) return;

        if (!res.ok) {
          throw new Error('Greeting request failed');
        }

        const data = await res.json();
        if (data.conversation_id && onConversationCreated) {
          onConversationCreated(data.conversation_id);
        }

        const greetingSpeech = data.reply_text || fallbackText;
        setTranscript('');
        setLastCompanionSpeech(greetingSpeech);
        setErrorMessage(null);

        const detectedEmotion = validateAvatarEmotion(data.emotion || 'happy');
        setCurrentEmotion(detectedEmotion);
        setEmotionIntensity(typeof data.emotion_intensity === 'number' ? data.emotion_intensity : 0.8);

        // Check for background SadTalker lip-sync video generation job
        if (data.sadtalker_job_id) {
          handleSadTalkerJob(data.sadtalker_job_id, currentSessionId);
        }

        if (data.audio_base64) {
          playAssistantAudio(data.audio_base64, greetingSpeech, currentSessionId, data.audio_format || 'audio/mpeg');
        } else {
          setState('idle');
        }
      } catch (err: unknown) {
        const errorObj = err as { name?: string; message?: string } | null;
        if (
          errorObj?.name === 'AbortError' ||
          controller.signal.aborted ||
          currentSessionId !== activeSessionIdRef.current ||
          errorObj?.message?.toLowerCase().includes('abort')
        ) {
          return;
        }

        // Instant fallback: avatar greets and shows text without distorted browser speech
        setTranscript('');
        setLastCompanionSpeech(fallbackText);
        setErrorMessage(null);
        setState('idle');
      }
    },
    [companionId, conversationId, companionName, onConversationCreated, playAssistantAudio, voiceSettings, handleSadTalkerJob]
  );

  // Resume/unblock audio when browser autoplay policy requires user interaction
  const resumeAudio = useCallback(() => {
    setAutoplayBlocked(false);
    if (pendingAudioPlaybackRef.current) {
      const play = pendingAudioPlaybackRef.current;
      pendingAudioPlaybackRef.current = null;
      play();
    }
  }, []);

  // One-time interaction listener to unblock audio on first user touch/click/keypress
  useEffect(() => {
    if (!autoplayBlocked) return;
    const handleInteraction = () => {
      resumeAudio();
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [autoplayBlocked, resumeAudio]);

  // Proactively trigger companion greeting when companion is ready
  useEffect(() => {
    if (autoGreet && companionId) {
      triggerGreeting();
    }
  }, [autoGreet, companionId, triggerGreeting]);

  // Keep refs in sync for recursive event loops
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Complete leak-free cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlaybackMonitoring();
      if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== 'closed') {
        try {
          playbackAudioContextRef.current.close();
        } catch {
          // Ignored
        }
        playbackAudioContextRef.current = null;
      }
      if (autoListenTimerRef.current) {
        clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      cancelActiveSadTalkerJob();
      cleanupMicrophone();
    };
  }, [cleanupMicrophone, stopPlaybackMonitoring, cancelActiveSadTalkerJob]);

  return {
    state,
    transcript,
    lastCompanionSpeech,
    errorMessage,
    audioLevel,
    voiceSettings,
    setVoiceSettings,
    availableVoices,
    autoplayBlocked,
    resumeAudio,
    triggerGreeting,
    replaySpeech,
    startListening,
    stopListening,
    interrupt,
    submitText,
    handsFree,
    setHandsFree,
    toggleHandsFree,
    isUserSpeaking,
    currentEmotion,
    emotionIntensity,
    sadtalkerVideoUrl,
    // Word-level alignment data from streaming TTS (cumulative, relative to utterance start)
    wordAlignment: latestAlignmentRef.current,
  };
}
