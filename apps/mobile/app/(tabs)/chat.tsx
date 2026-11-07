/**
 * Mobile Live Companion Screen.
 * Full voice conversation companion stage with the 3D customizable avatar:
 * - Loads and displays the authenticated user's active avatar configuration
 * - Speech-driven facial animations with resting jaw recovery
 * - Interruption handling that resets mouth aperture without stuck frames
 * - Push-to-talk and text-fallback conversation input
 * - Natural blinking schedule and clean GPU disposal on unmount
 * - Resilient: speech & conversation continue even if 3D renderer falls back to 2D
 * - Streaming TTS with word-level timestamps for viseme animation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  Avatar3DConfig,
  DEFAULT_AVATAR_3D_CONFIG,
} from '@ai-companion/shared';
import { MobileAvatarRenderer } from '../../src/components/avatar/MobileAvatarRenderer';
import { CameraPreset } from '../../src/components/avatar/ThreeSceneManager';
import {
  getActiveAvatar,
  getCachedAvatar,
} from '../../src/services/avatar-service';
import { fetchWithAuth, getApiBaseUrl } from '../../src/services/api-client';
import { getAccessToken } from '../../src/services/auth-storage';
import { useAiStatus } from '../../src/services/ai-status';
import { AiStatusBanner } from '../../src/components/AiStatusBanner';
import { routeMessage } from '../../src/engine/ai-router';
import { pickFiller } from '../../src/engine/filler-replies';
import {
  isSttAvailable,
  startRecording,
  RecordingSession,
} from '../../src/engine/local-stt';
import { getSttModelId } from '../../src/services/preferences';
import { isModelDownloaded } from '../../src/engine/model-manager';

type AvatarDisplayMode = '3d' | 'photorealistic-2d';

interface ChatMessage {
  id: string;
  sender: 'user' | 'companion';
  text: string;
  timestamp: Date;
  isFiller?: boolean;
}

const FILLER_ID = 'filler-active';
const FILLER_DELAY_MS = 400;

interface WordAlignment {
  words: string[];
  word_start_times_seconds: number[];
  word_end_times_seconds: number[];
}

interface AvatarAssets {
  portraitUrl: string;
  blinkUrl: string | null;
  speakUrl: string | null;
}

interface CompanionLandmarks {
  eyeX: string;
  eyeY: string;
  eyeWidth: string;
  eyeHeight: string;
  mouthX: string;
  mouthY: string;
  mouthWidth: string;
  mouthHeight: string;
}

function resolveCompanionLandmarks(name: string): CompanionLandmarks {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('marcus')) {
    return {
      eyeX: '52.8%',
      eyeY: '34.4%',
      eyeWidth: '34%',
      eyeHeight: '16%',
      mouthX: '53.0%',
      mouthY: '57.3%',
      mouthWidth: '30%',
      mouthHeight: '18%',
    };
  }
  if (nameLower.includes('elena')) {
    return {
      eyeX: '51.0%',
      eyeY: '33.8%',
      eyeWidth: '36%',
      eyeHeight: '16%',
      mouthX: '52.3%',
      mouthY: '51.9%',
      mouthWidth: '32%',
      mouthHeight: '18%',
    };
  }
  if (nameLower.includes('liam')) {
    return {
      eyeX: '51.6%',
      eyeY: '38.3%',
      eyeWidth: '36%',
      eyeHeight: '16%',
      mouthX: '51.5%',
      mouthY: '60.9%',
      mouthWidth: '32%',
      mouthHeight: '18%',
    };
  }
  // Default: Aria
  return {
    eyeX: '49.6%',
    eyeY: '36.0%',
    eyeWidth: '36%',
    eyeHeight: '16%',
    mouthX: '50.1%',
    mouthY: '58.5%',
    mouthWidth: '30%',
    mouthHeight: '18%',
  };
}

/**
 * Photorealistic2DAvatar Component.
 * High-fidelity 2D avatar using layered images (portrait, blink, speak) with mask-based animations.
 * Mirrors the web AvatarRenderer behavior for consistent cross-platform experience.
 */
interface Photorealistic2DAvatarProps {
  assets: AvatarAssets;
  landmarks: CompanionLandmarks;
  name: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
  state: 'idle' | 'listening' | 'processing_speech' | 'generating_response' | 'speaking' | 'interrupted' | 'error';
  size?: number;
  testID?: string;
  reducedMotion?: boolean;
}

function Photorealistic2DAvatar({
  assets,
  landmarks: _landmarks,
  name,
  isSpeaking,
  isListening,
  audioLevel,
  state,
  size = 280,
  testID = 'photorealistic-2d-avatar',
  reducedMotion = false,
}: Photorealistic2DAvatarProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouthIntensity, setMouthIntensity] = useState(0);
  const [imageError, setImageError] = useState(false);
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeSpeaking = isSpeaking || state === 'speaking';

  // Periodic natural human blink cycle
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

  // Speech mouth movement using amplitude envelope
  useEffect(() => {
    if (!activeSpeaking) {
      setMouthIntensity(0);
      return;
    }

    let animId: number;

    const animateMouth = () => {
      let target = 0;
      if (audioLevel > 0.03) {
        target = Math.min(1.0, audioLevel * 1.5);
      } else {
        target = 0.0;
      }

      setMouthIntensity((prev) => {
        const next = prev + (target - prev) * 0.40;
        return next < 0.01 ? 0 : next;
      });

      animId = requestAnimationFrame(animateMouth);
    };

    animId = requestAnimationFrame(animateMouth);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [activeSpeaking, audioLevel]);

  // Voice state visual aura
  const postureTransform = (() => {
    if (reducedMotion) return { transform: [] };
    switch (state) {
      case 'listening':
        return { transform: [{ scale: 1.015 }, { rotate: '-1deg' }, { translateY: -1 }] };
      case 'processing_speech':
      case 'generating_response':
        return { transform: [{ scale: 1.008 }, { rotate: '1deg' }, { translateY: -1 }] };
      case 'speaking':
        return { transform: [{ scale: 1.01 }, { translateY: -1 }] };
      case 'interrupted':
        return { transform: [{ scale: 1.0 }, { translateY: 0 }] };
      default:
        return { transform: [{ scale: 1.0 }, { translateY: 0 }] };
    }
  })();

  // Fallback state when image loading failed
  if (imageError || !assets) {
    const initials = (name || 'AI')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <View
        testID={testID}
        style={[
          styles2D.avatarContainer,
          { width: size, height: size },
          { borderWidth: 2, borderColor: state === 'speaking' ? '#8b5cf6' : state === 'listening' ? '#22c55e' : '#334155' },
        ]}
        accessibilityLabel={name}
      >
        <Text style={styles2D.fallbackInitials}>{initials}</Text>
      </View>
    );
  }

  const { portraitUrl, blinkUrl, speakUrl } = assets;

  return (
    <View
      testID={testID}
      style={[
        styles2D.avatarContainer,
        { width: size, height: size },
        { borderWidth: 2, borderColor: state === 'speaking' ? '#8b5cf6' : state === 'listening' ? '#22c55e' : '#334155' },
      ]}
    >
      {/* Speaking/Listening ripple rings */}
      {(activeSpeaking || isListening) && !reducedMotion && (
        <View
          style={[
            styles2D.rippleRing,
            {
              borderColor: activeSpeaking ? 'rgba(139, 92, 246, 0.4)' : 'rgba(34, 197, 94, 0.4)',
            },
          ]}
        />
      )}

      {/* Head Motion Container */}
      <Animated.View
        style={[
          styles2D.headContainer,
          postureTransform,
          !reducedMotion && styles2D.breatheAnimation,
        ]}
      >
        {/* Base Photorealistic Portrait */}
        <Image
          source={{ uri: portraitUrl }}
          style={styles2D.portraitImage}
          onError={() => setImageError(true)}
        />

        {/* Natural Eyelid Blink Layer */}
        {blinkUrl && (
          <Animated.View
            style={[
              styles2D.blinkLayer,
              {
                opacity: isBlinking ? 1 : 0,
                // Note: React Native doesn't support CSS mask-image directly
                // Using a simplified approach with absolute positioning
              },
            ]}
          >
            <Image source={{ uri: blinkUrl }} style={styles2D.layerImage} />
          </Animated.View>
        )}

        {/* Speech Mouth Layer */}
        {speakUrl && activeSpeaking && (
          <Animated.View
            style={[
              styles2D.speakLayer,
              {
                opacity: Math.min(1.0, mouthIntensity * 1.15),
              },
            ]}
          >
            <Image source={{ uri: speakUrl }} style={styles2D.layerImage} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles2D = StyleSheet.create({
  avatarContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderRadius: 24,
  },
  headContainer: {
    width: '100%',
    height: '100%',
    transformOrigin: '50% 70%',
  },
  breatheAnimation: {
    // Animation handled by Animated.View style
  },
  portraitImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  blinkLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  speakLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  layerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fallbackInitials: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#64748b',
  },
});

interface WordAlignment {
  words: string[];
  word_start_times_seconds: number[];
  word_end_times_seconds: number[];
}

interface AvatarAssets {
  portraitUrl: string;
  blinkUrl: string | null;
  speakUrl: string | null;
}

export default function ChatScreen() {
  const [avatarConfig, setAvatarConfig] = useState<Avatar3DConfig>(
    getCachedAvatar()?.config || DEFAULT_AVATAR_3D_CONFIG
  );
  const [isLoadingAvatar, setIsLoadingAvatar] = useState<boolean>(!getCachedAvatar());
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bust');

  // Conversation & Speech states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'companion',
      text: 'Hello! I am ready to talk. How are you doing today?',
      timestamp: new Date(),
    },
  ]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [inputText, setTextInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [companionName, setCompanionName] = useState<string>('Aria');
  const [currentAlignment, setCurrentAlignment] = useState<WordAlignment | null>(null);
  const [displayMode, setDisplayMode] = useState<AvatarDisplayMode>('photorealistic-2d');
  const [avatarAssets, setAvatarAssets] = useState<AvatarAssets | null>(null);

  const aiStatus = useAiStatus();
  const recordingRef = useRef<RecordingSession | null>(null);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const fillerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<number>(0);
  const audioChunksRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);

  // 1. Fetch authenticated active avatar on mount or focus
  const loadAvatar = useCallback(async () => {
    const res = await getActiveAvatar();
    if (res.avatar) {
      setAvatarConfig(res.avatar.config);
      if (res.avatar.name) setCompanionName(res.avatar.name);
    }
    setIsLoadingAvatar(false);
  }, []);

  useEffect(() => {
    loadAvatar();
  }, [loadAvatar]);

  // Load photorealistic 2D avatar assets based on companion name
  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    const nameLower = companionName.toLowerCase();
    let assets: AvatarAssets;
    
    if (nameLower.includes('marcus')) {
      assets = {
        portraitUrl: `${baseUrl}/avatars/marcus-portrait.webp`,
        blinkUrl: `${baseUrl}/avatars/marcus-blink.webp`,
        speakUrl: `${baseUrl}/avatars/marcus-speak.webp`,
      };
    } else if (nameLower.includes('elena')) {
      assets = {
        portraitUrl: `${baseUrl}/avatars/elena-portrait.webp`,
        blinkUrl: `${baseUrl}/avatars/elena-blink.webp`,
        speakUrl: `${baseUrl}/avatars/elena-speak.webp`,
      };
    } else if (nameLower.includes('liam')) {
      assets = {
        portraitUrl: `${baseUrl}/avatars/liam-portrait.webp`,
        blinkUrl: `${baseUrl}/avatars/liam-blink.webp`,
        speakUrl: `${baseUrl}/avatars/liam-speak.webp`,
      };
    } else {
      // Default to Aria
      assets = {
        portraitUrl: `${baseUrl}/avatars/aria-portrait.webp`,
        blinkUrl: `${baseUrl}/avatars/aria-blink.webp`,
        speakUrl: `${baseUrl}/avatars/aria-speak.webp`,
      };
    }
    setAvatarAssets(assets);
  }, [companionName]);

  // Clean up all timers and audio on unmount
  useEffect(() => {
    return () => {
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (recordingRef.current) {
        recordingRef.current.cancel().catch(() => {});
        recordingRef.current = null;
      }
      if (fillerTimerRef.current) {
        clearTimeout(fillerTimerRef.current);
        fillerTimerRef.current = null;
      }
      Speech.stop();
    };
  }, []);

  // 2. Simulate Companion Speech with Viseme & Audio Modulation (fallback)
  const simulateCompanionSpeech = useCallback((text: string) => {
    // Stop any existing speech
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    setIsSpeaking(true);
    setIsListening(false);

    // Audio level fluctuation simulating speech formants
    audioIntervalRef.current = setInterval(() => {
      setAudioLevel(0.25 + Math.random() * 0.55);
    }, 90);

    // Estimate speaking duration based on word count (approx. 240ms per word)
    const wordCount = text.split(/\s+/).length;
    const durationMs = Math.max(2200, Math.min(10000, wordCount * 240));

    speechTimerRef.current = setTimeout(() => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      setIsSpeaking(false);
      setAudioLevel(0);
    }, durationMs);
  }, []);

  // Play companion speech using streaming TTS with word-level timestamps
  const playCompanionSpeechStreaming = useCallback(async (text: string, voiceName?: string) => {
    // Cancel any existing playback
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);

    const currentSessionId = ++sessionIdRef.current;
    audioChunksRef.current = [];
    isPlayingRef.current = true;

    setIsSpeaking(true);
    setIsListening(false);
    setCurrentAlignment(null);

    // Audio level fluctuation simulating speech formants
    audioIntervalRef.current = setInterval(() => {
      setAudioLevel(0.25 + Math.random() * 0.55);
    }, 90);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const baseUrl = getApiBaseUrl();
      const token = await getAccessToken();
      
      const res = await fetch(`${baseUrl}/api/v1/voice/synthesize-stream-with-timestamps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text,
          voice: voiceName,
          turn_id: `turn_${currentSessionId}`,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Stream failed: ${res.status}`);
      }
      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (currentSessionId !== sessionIdRef.current) {
          break; // Interrupted
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed);
            
            // Accumulate audio chunks
            if (chunk.audio) {
              audioChunksRef.current.push(chunk.audio);
            }
            
            // Handle alignment data for viseme animation
            if (chunk.alignment?.words && chunk.alignment.words.length > 0) {
              setCurrentAlignment(chunk.alignment);
            }
          } catch {
            // Ignore malformed NDJSON lines
          }
        }
      }

      // Play accumulated audio
      if (currentSessionId === sessionIdRef.current && audioChunksRef.current.length > 0 && isPlayingRef.current) {
        const fullAudioBase64 = audioChunksRef.current.join('');
        const audioUri = `data:audio/mpeg;base64,${fullAudioBase64}`;
        
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true, isLooping: false, rate: 1.0 },
          (status) => {
            if (status.isLoaded && status.didJustFinish && currentSessionId === sessionIdRef.current) {
              setIsSpeaking(false);
              setAudioLevel(0);
              setCurrentAlignment(null);
              if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
              isPlayingRef.current = false;
            }
          }
        );
        soundRef.current = sound;
      } else if (currentSessionId === sessionIdRef.current) {
        // No audio received, fall back to simulation
        if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
        setIsSpeaking(false);
        setAudioLevel(0);
        isPlayingRef.current = false;
      }
    } catch (err: unknown) {
      if (currentSessionId !== sessionIdRef.current) {
        return; // Interrupted
      }
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      setIsSpeaking(false);
      setAudioLevel(0);
      isPlayingRef.current = false;
      
      // Fallback to simulated speech
      simulateCompanionSpeech(text);
    }
  }, [simulateCompanionSpeech]);

  // 3. User Interruption Handling (Resets mouth cleanly)
  const handleInterrupt = useCallback(() => {
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (fillerTimerRef.current) {
      clearTimeout(fillerTimerRef.current);
      fillerTimerRef.current = null;
    }
    Speech.stop();
    sessionIdRef.current += 1; // Invalidate current session
    isPlayingRef.current = false;
    audioChunksRef.current = [];
    setIsSpeaking(false);
    setAudioLevel(0);
    setCurrentAlignment(null);
  }, []);

  // 4. Send Message to Backend / Companion
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const content = (textToSend || inputText).trim();
      if (!content || isSending) return;

      handleInterrupt(); // interrupt companion if speaking

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        text: content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setTextInput('');
      setIsSending(true);

      // Schedule a filler bubble if the reply hasn't arrived within FILLER_DELAY_MS.
      // Fast canned / local replies (< 400ms) never show one.
      if (fillerTimerRef.current) clearTimeout(fillerTimerRef.current);
      fillerTimerRef.current = setTimeout(() => {
        fillerTimerRef.current = null;
        const filler = pickFiller(content);
        setMessages((prev) => [
          ...prev,
          {
            id: FILLER_ID,
            sender: 'companion',
            text: filler,
            timestamp: new Date(),
            isFiller: true,
          },
        ]);
        // Speak the filler out loud via system TTS — offline, instant, no server call.
        // simulateCompanionSpeech animates the mouth for roughly the duration.
        Speech.stop();
        Speech.speak(filler, { pitch: 1.05, rate: 1.0 });
        simulateCompanionSpeech(filler);
      }, FILLER_DELAY_MS);

      const routed = await routeMessage(content);
      setIsSending(false);
      if (fillerTimerRef.current) {
        clearTimeout(fillerTimerRef.current);
        fillerTimerRef.current = null;
      }
      // Stop any filler currently being spoken so it doesn't overlap the real reply.
      Speech.stop();
      // Drop the filler bubble before showing the real reply or error.
      setMessages((prev) => prev.filter((m) => m.id !== FILLER_ID));

      if (!routed.ok || !routed.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'companion',
            text: `[AI unavailable · ${routed.source}] ${routed.error ?? 'Unknown error'}`,
            timestamp: new Date(),
          },
        ]);
        if (routed.source === 'lan') void aiStatus.recheck();
        return;
      }

      const replyText = routed.content;
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          sender: 'companion',
          text: replyText,
          timestamp: new Date(),
        },
      ]);

      // TTS only works via the LAN backend (voice endpoint lives on FastAPI).
      // Canned + on-device replies get displayed text + simulated mouth motion.
      if (routed.source === 'lan') {
        await playCompanionSpeechStreaming(replyText, 'en-US-JennyNeural');
      } else {
        simulateCompanionSpeech(replyText);
      }
    },
    [inputText, isSending, handleInterrupt, playCompanionSpeechStreaming, simulateCompanionSpeech, aiStatus]
  );

  // 5. Push-To-Talk: real recording → whisper.rn → routeMessage
  const handleToggleListening = useCallback(async () => {
    if (isListening) {
      // Stop recording and transcribe
      setIsListening(false);
      const session = recordingRef.current;
      recordingRef.current = null;
      if (!session) return;
      setIsTranscribing(true);
      try {
        const text = await session.stopAndTranscribe();
        if (text.trim()) {
          await handleSendMessage(text.trim());
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              sender: 'companion',
              text: '[No speech detected]',
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'companion',
            text: `[Voice input failed] ${
              err instanceof Error ? err.message : 'Unknown error'
            }`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Starting: verify STT is configured
    if (!isSttAvailable()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'companion',
          text: '[Voice input unavailable] whisper.rn native module is not installed in this build.',
          timestamp: new Date(),
        },
      ]);
      return;
    }
    const sttId = await getSttModelId();
    if (!sttId || !(await isModelDownloaded(sttId))) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'companion',
          text: '[Voice input unavailable] Download a Whisper model in Settings → On-device AI.',
          timestamp: new Date(),
        },
      ]);
      return;
    }

    handleInterrupt();
    try {
      recordingRef.current = await startRecording();
      setIsListening(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'companion',
          text: `[Microphone] ${
            err instanceof Error ? err.message : 'Could not start recording'
          }`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isListening, handleInterrupt, handleSendMessage]);

  const lastMessage = messages[messages.length - 1];

  return (
    <SafeAreaView style={styles.safeContainer}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AiStatusBanner status={aiStatus} onRetry={aiStatus.recheck} />

        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{companionName}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isSpeaking ? '#10b981' : isListening ? '#38bdf8' : '#94a3b8' },
                ]}
              />
              <Text style={styles.headerSubtitle}>
                {isSpeaking ? 'Speaking' : isListening ? 'Listening...' : 'Active Companion'}
              </Text>
            </View>
          </View>

          {/* Camera Preset Switcher */}
          <View style={styles.cameraRow}>
            {(['face', 'bust', 'full'] as CameraPreset[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.cameraChip, cameraPreset === p && styles.cameraChipActive]}
                onPress={() => setCameraPreset(p)}
              >
                <Text
                  style={[
                    styles.cameraChipText,
                    cameraPreset === p && styles.cameraChipTextActive,
                  ]}
                >
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Avatar Presentation Stage */}
        <View style={styles.avatarStage}>
          {displayMode === 'photorealistic-2d' ? (
            <Photorealistic2DAvatar
              assets={avatarAssets || {
                portraitUrl: `${getApiBaseUrl()}/avatars/aria-portrait.webp`,
                blinkUrl: `${getApiBaseUrl()}/avatars/aria-blink.webp`,
                speakUrl: `${getApiBaseUrl()}/avatars/aria-speak.webp`,
              }}
              landmarks={resolveCompanionLandmarks(companionName)}
              name={companionName}
              isSpeaking={isSpeaking}
              isListening={isListening}
              audioLevel={audioLevel}
              state={isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle'}
              size={320}
              testID="photorealistic-2d-avatar"
            />
          ) : (
            <MobileAvatarRenderer
              config={avatarConfig}
              cameraPreset={cameraPreset}
              isSpeaking={isSpeaking}
              isListening={isListening}
              audioLevel={audioLevel}
              wordAlignment={currentAlignment}
            />
          )}

          {/* Companion Subtitle Bubble Overlay */}
          {lastMessage && (
            <View style={styles.subtitleOverlay}>
              <Text style={styles.subtitleSender}>
                {lastMessage.sender === 'user' ? 'You' : companionName}
              </Text>
              <Text
                style={[
                  styles.subtitleText,
                  lastMessage.isFiller && styles.subtitleFiller,
                ]}
                numberOfLines={3}
              >
                {lastMessage.text}
              </Text>
            </View>
          )}

          {/* Interruption Button when Companion is Speaking */}
          {isSpeaking && (
            <TouchableOpacity style={styles.interruptButton} onPress={handleInterrupt}>
              <Text style={styles.interruptButtonText}>Interrupt</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Voice & Conversation Action Bar */}
        <View style={styles.controlsBar}>
          {/* Display Mode Toggle */}
          <TouchableOpacity
            style={[
              styles.modeToggle,
              displayMode === 'photorealistic-2d' && styles.modeToggleActive,
            ]}
            onPress={() => setDisplayMode(displayMode === 'photorealistic-2d' ? '3d' : 'photorealistic-2d')}
          >
            <Text style={styles.modeToggleText}>
              {displayMode === 'photorealistic-2d' ? 'Photo 2D' : '3D'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.keyboardToggle}
            onPress={() => setShowTextInput((prev) => !prev)}
          >
            <Text style={styles.keyboardToggleText}>
              {showTextInput ? 'Mic' : 'Text'}
            </Text>
          </TouchableOpacity>

          {/* Main Push-To-Talk Button */}
          <TouchableOpacity
            style={[
              styles.micButton,
              isListening && styles.micButtonListening,
              isSpeaking && styles.micButtonSpeaking,
            ]}
            onPress={handleToggleListening}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.micInnerCircle,
                isListening && styles.micInnerCircleListening,
              ]}
            >
              <Text style={styles.micIconText}>
                {isTranscribing
                  ? '…'
                  : isListening
                    ? 'Stop'
                    : isSpeaking
                      ? 'Listen'
                      : 'Talk'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={loadAvatar}
            disabled={isLoadingAvatar}
          >
            <Text style={styles.refreshButtonText}>Sync</Text>
          </TouchableOpacity>
        </View>

        {/* Text Input Drawer */}
        {showTextInput && (
          <View style={styles.inputDrawer}>
            <TextInput
              style={styles.textInput}
              placeholder="Type message to companion..."
              placeholderTextColor="#64748b"
              value={inputText}
              onChangeText={setTextInput}
              onSubmitEditing={() => handleSendMessage()}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  cameraRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cameraChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cameraChipActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  cameraChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  cameraChipTextActive: {
    color: '#090d16',
  },
  avatarStage: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#020617',
  },
  subtitleOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  subtitleSender: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subtitleText: {
    color: '#f1f5f9',
    fontSize: 14,
    lineHeight: 20,
  },
  subtitleFiller: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  interruptButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  interruptButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modeToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeToggleActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  modeToggleText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  keyboardToggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  keyboardToggleText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  micButtonListening: {
    backgroundColor: '#38bdf8',
    transform: [{ scale: 1.06 }],
  },
  micButtonSpeaking: {
    backgroundColor: '#10b981',
  },
  micInnerCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micInnerCircleListening: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  micIconText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  refreshButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  inputDrawer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#090d16',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sendButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
});