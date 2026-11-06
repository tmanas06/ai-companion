'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { CompanionVoiceState } from '@/components/companion/AvatarRenderer';
import {
  selectVoiceForCompanion,
  getCompanionVoiceProfile,
} from '@/lib/voice-manager';

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
  onConversationCreated?: (newId: string) => void;
  onError?: (err: string) => void;
}

function loadCompanionVoiceSettings(
  id?: string,
  name?: string,
  gender: 'male' | 'female' = 'female'
): VoiceSettings {
  const profile = getCompanionVoiceProfile(name, gender);
  if (typeof window !== 'undefined') {
    try {
      if (id) {
        const saved = localStorage.getItem(`ai_companion_voice_${id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            speechRate: typeof parsed.speechRate === 'number' ? parsed.speechRate : profile.speechRate,
            pitch: typeof parsed.pitch === 'number' ? parsed.pitch : profile.pitch,
            ttsEngine: parsed.ttsEngine === 'browser' ? 'browser' : 'backend',
            voiceName: parsed.voiceName || profile.neuralVoice,
          };
        }
      }
      const generic = localStorage.getItem('ai_companion_voice_settings');
      if (generic) {
        const parsed = JSON.parse(generic);
        return {
          speechRate: typeof parsed.speechRate === 'number' ? parsed.speechRate : profile.speechRate,
          pitch: typeof parsed.pitch === 'number' ? parsed.pitch : profile.pitch,
          ttsEngine: parsed.ttsEngine === 'browser' ? 'browser' : 'backend',
          voiceName: parsed.voiceName || profile.neuralVoice,
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
    voiceName: profile.neuralVoice,
  };
}

export function useLiveVoiceCompanion({
  companionId,
  conversationId,
  companionGender = 'female',
  companionName,
  onConversationCreated,
  onError,
}: UseLiveVoiceCompanionOptions) {
  const [state, setState] = useState<CompanionVoiceState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [lastCompanionSpeech, setLastCompanionSpeech] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [voiceSettings, setVoiceSettingsState] = useState<VoiceSettings>(() =>
    loadCompanionVoiceSettings(companionId, companionName, companionGender)
  );

  // Sync settings whenever active companion or gender changes
  useEffect(() => {
    setVoiceSettingsState(loadCompanionVoiceSettings(companionId, companionName, companionGender));
  }, [companionId, companionName, companionGender]);

  const setVoiceSettings = useCallback((newSettings: VoiceSettings) => {
    setVoiceSettingsState(newSettings);
    if (typeof window !== 'undefined') {
      try {
        if (companionId) {
          localStorage.setItem(`ai_companion_voice_${companionId}`, JSON.stringify(newSettings));
        }
        localStorage.setItem('ai_companion_voice_settings', JSON.stringify(newSettings));
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
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Monitor audio amplitude for animated visualizer/mouth
  const monitorAudioLevels = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] ?? 0;
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(1.0, avg / 128.0);
      setAudioLevel(normalized);
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  // Immediate Interruption handler
  const interrupt = useCallback(() => {
    // 1. Invalidate current session token so stale responses cannot play
    activeSessionIdRef.current += 1;

    // 2. Abort pending network fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 3. Stop currently playing audio
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

    // 6. Explicit state transition
    setState('interrupted');
    setTimeout(() => {
      setState((prev) => (prev === 'interrupted' ? 'idle' : prev));
    }, 700);
  }, [cleanupMicrophone]);

  // Play assistant audio response with amplitude monitoring
  const playAssistantAudio = useCallback(
    async (audioBase64: string, fallbackText: string, sessionId: number, audioFormat?: string) => {
      if (sessionId !== activeSessionIdRef.current) {
        return; // Session cancelled/interrupted
      }

      try {
        // Convert base64 to audio object
        const mime = audioFormat && audioFormat.includes('/') ? audioFormat : `audio/${audioFormat || 'mpeg'}`;
        const audioSrc = `data:${mime};base64,${audioBase64}`;
        const audio = new Audio(audioSrc);
        activeAudioRef.current = audio;

        // Try setting playback rate
        audio.playbackRate = voiceSettings.speechRate;

        // Only transition to 'speaking' when audio actually starts playback
        audio.onplay = () => {
          if (sessionId === activeSessionIdRef.current) {
            setState('speaking');
            setErrorMessage(null);
          } else {
            audio.pause();
          }
        };

        audio.onended = () => {
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setAudioLevel(0);
          }
          activeAudioRef.current = null;
        };

        audio.onerror = () => {
          // If WAV decode failed, fallback to Web Speech Synthesis
          if (sessionId === activeSessionIdRef.current) {
            playBrowserSpeech(fallbackText, sessionId);
          }
        };

        await audio.play();
      } catch (e) {
        // Fallback to browser speech if audio autoplay is restricted or failed
        playBrowserSpeech(fallbackText, sessionId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voiceSettings]
  );

  // Fallback / client-side speech synthesis
  const playBrowserSpeech = useCallback(
    (text: string, sessionId: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setState('idle');
        return;
      }

      if (sessionId !== activeSessionIdRef.current) {
        return;
      }

      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        activeUtteranceRef.current = utterance;

        // Guaranteed gender-matched voice & distinct pitch profile
        const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
        const gender = companionGender || 'female';
        const selection = selectVoiceForCompanion(
          voices,
          gender,
          companionName,
          voiceSettings.voiceName
        );

        if (selection.voice) {
          utterance.voice = selection.voice;
          utterance.lang = selection.voice.lang || 'en-US';
        }

        // Apply pitch:
        // Use user-customized pitch if explicitly configured, but enforce gender acoustic formant
        let effectivePitch = voiceSettings.pitch;
        if (voiceSettings.pitch === 1.0) {
          effectivePitch = selection.pitch;
        }
        if (gender === 'male' && effectivePitch > 0.95) {
          effectivePitch = selection.pitch <= 0.88 ? selection.pitch : 0.86;
        } else if (gender === 'female' && effectivePitch < 0.95) {
          effectivePitch = selection.pitch >= 1.0 ? selection.pitch : 1.04;
        }

        utterance.pitch = effectivePitch;
        utterance.rate = voiceSettings.speechRate;

        utterance.onstart = () => {
          if (sessionId === activeSessionIdRef.current) {
            setState('speaking');
            setErrorMessage(null);
          } else {
            window.speechSynthesis.cancel();
          }
        };

        utterance.onend = () => {
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setAudioLevel(0);
          }
          activeUtteranceRef.current = null;
        };

        utterance.onerror = (e) => {
          if ((e as { error?: string })?.error === 'canceled' || (e as { error?: string })?.error === 'interrupted') {
            return;
          }
          if (sessionId === activeSessionIdRef.current) {
            setState('idle');
            setAudioLevel(0);
          }
          activeUtteranceRef.current = null;
        };

        setState('speaking');
        setErrorMessage(null);

        window.speechSynthesis.speak(utterance);

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {
        console.error('Speech synthesis execution failed:', e);
        setState('idle');
      }
    },
    [availableVoices, companionGender, companionName, voiceSettings]
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
          formData.append('audio_file', audioBlob, 'mic_input.wav');
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

        // Play companion response:
        // When backend provides audio_base64 and user hasn't explicitly forced browser-only,
        // play the high-fidelity neural audio
        if (data.audio_base64 && voiceSettings.ttsEngine !== 'browser') {
          playAssistantAudio(data.audio_base64, replyText, currentSessionId, data.audio_format || 'audio/mpeg');
        } else {
          playBrowserSpeech(replyText, currentSessionId);
        }
      } catch (err: unknown) {
        const errorObj = err as { name?: string; message?: string } | null;
        if (errorObj?.name === 'AbortError' || currentSessionId !== activeSessionIdRef.current) {
          return; // Interrupted gracefully
        }
        const msg = errorObj?.message || 'Failed to communicate with companion';
        setErrorMessage(msg);
        setState('error');
        if (onError) onError(msg);
      }
    },
    [companionId, conversationId, onConversationCreated, onError, playAssistantAudio, playBrowserSpeech, voiceSettings]
  );

  // Start microphone capture
  const startListening = useCallback(async () => {
    // Prevent overlapping sessions
    if (state === 'speaking' || state === 'generating_response' || state === 'processing_speech') {
      interrupt();
    }

    setErrorMessage(null);
    setState('requesting_microphone');
    audioChunksRef.current = [];

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
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;
        monitorAudioLevels(analyser);
      } catch (e) {
        // Visualizer fallback
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
        cleanupMicrophone();

        if (blob.size === 0) {
          setState('idle');
          return;
        }

        setState('processing_speech');
        submitVoiceTurn(blob);
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        cleanupMicrophone();
        setState('idle');
      }
    } else {
      cleanupMicrophone();
      setState('idle');
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

  // Replay last speech response
  const replaySpeech = useCallback(() => {
    if (!lastCompanionSpeech) return;
    const currentSessionId = ++activeSessionIdRef.current;
    playBrowserSpeech(lastCompanionSpeech, currentSessionId);
  }, [lastCompanionSpeech, playBrowserSpeech]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      cleanupMicrophone();
    };
  }, [cleanupMicrophone]);

  return {
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
  };
}
