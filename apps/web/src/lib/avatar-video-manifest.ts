/**
 * Avatar Video Manifest & Asset Schema
 * ====================================
 * Types, catalog definitions, and resolution logic for photorealistic video avatar assets.
 */

export type AvatarInteractionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reaction'
  | 'greeting'
  | 'goodbye'
  | 'error';

export type AvatarEmotion =
  | 'neutral'
  | 'happy'
  | 'empathetic'
  | 'sad'
  | 'surprised'
  | 'curious'
  | 'confused'
  | 'laughing'
  | 'reassuring';

export interface VideoAssetEntry {
  id: string;
  state: AvatarInteractionState;
  emotion: AvatarEmotion;
  path: string;
  webmPath?: string;
  duration: number; // in seconds
  isLoopable: boolean;
  hasAudio: boolean;
  transitionBehavior: 'crossfade' | 'cut' | 'wait_for_end';
  resolution: {
    width: number;
    height: number;
  };
  aspectRatio: string;
  source: string;
  license: string;
}

export interface AvatarVideoManifest {
  character: string;
  version: number;
  canonicalReference: string;
  defaultState: AvatarInteractionState;
  assets: VideoAssetEntry[];
}

export const ARIA_VIDEO_MANIFEST: AvatarVideoManifest = {
  character: 'aria',
  version: 1,
  canonicalReference: '/avatars/aria-portrait.webp',
  defaultState: 'idle',
  assets: [
    // 1. Idle Clips
    {
      id: 'aria_idle_01',
      state: 'idle',
      emotion: 'neutral',
      path: '/avatars/aria/idle/idle_01.mp4',
      webmPath: '/avatars/aria/idle/idle_01.webm',
      duration: 4.0,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_idle_02',
      state: 'idle',
      emotion: 'neutral',
      path: '/avatars/aria/idle/idle_02.mp4',
      webmPath: '/avatars/aria/idle/idle_02.webm',
      duration: 5.0,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },

    // 2. Listening Clips
    {
      id: 'aria_listening_01',
      state: 'listening',
      emotion: 'neutral',
      path: '/avatars/aria/listening/listening_01.mp4',
      webmPath: '/avatars/aria/listening/listening_01.webm',
      duration: 3.5,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_listening_02',
      state: 'listening',
      emotion: 'neutral',
      path: '/avatars/aria/listening/listening_02.mp4',
      webmPath: '/avatars/aria/listening/listening_02.webm',
      duration: 4.0,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },

    // 3. Thinking Clips
    {
      id: 'aria_thinking_01',
      state: 'thinking',
      emotion: 'curious',
      path: '/avatars/aria/thinking/thinking_01.mp4',
      webmPath: '/avatars/aria/thinking/thinking_01.webm',
      duration: 3.0,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },

    // 4. Speaking Clips
    {
      id: 'aria_speaking_01',
      state: 'speaking',
      emotion: 'neutral',
      path: '/avatars/aria/speaking/speaking_01.mp4',
      webmPath: '/avatars/aria/speaking/speaking_01.webm',
      duration: 3.5,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_speaking_02',
      state: 'speaking',
      emotion: 'neutral',
      path: '/avatars/aria/speaking/speaking_02.mp4',
      webmPath: '/avatars/aria/speaking/speaking_02.webm',
      duration: 4.0,
      isLoopable: true,
      hasAudio: false,
      transitionBehavior: 'crossfade',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },

    // 5. Emotional Reactions
    {
      id: 'aria_happy_01',
      state: 'reaction',
      emotion: 'happy',
      path: '/avatars/aria/happy/happy_01.mp4',
      webmPath: '/avatars/aria/happy/happy_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_empathetic_01',
      state: 'reaction',
      emotion: 'empathetic',
      path: '/avatars/aria/empathetic/empathetic_01.mp4',
      webmPath: '/avatars/aria/empathetic/empathetic_01.webm',
      duration: 3.0,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_sad_01',
      state: 'reaction',
      emotion: 'sad',
      path: '/avatars/aria/sad/sad_01.mp4',
      webmPath: '/avatars/aria/sad/sad_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_surprised_01',
      state: 'reaction',
      emotion: 'surprised',
      path: '/avatars/aria/surprised/surprised_01.mp4',
      webmPath: '/avatars/aria/surprised/surprised_01.webm',
      duration: 2.0,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_confused_01',
      state: 'reaction',
      emotion: 'confused',
      path: '/avatars/aria/confused/confused_01.mp4',
      webmPath: '/avatars/aria/confused/confused_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_laughing_01',
      state: 'reaction',
      emotion: 'laughing',
      path: '/avatars/aria/laughing/laughing_01.mp4',
      webmPath: '/avatars/aria/laughing/laughing_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },

    // 6. Greetings & Goodbyes
    {
      id: 'aria_greeting_01',
      state: 'greeting',
      emotion: 'happy',
      path: '/avatars/aria/greeting/greeting_01.mp4',
      webmPath: '/avatars/aria/greeting/greeting_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
    {
      id: 'aria_goodbye_01',
      state: 'goodbye',
      emotion: 'reassuring',
      path: '/avatars/aria/goodbye/goodbye_01.mp4',
      webmPath: '/avatars/aria/goodbye/goodbye_01.webm',
      duration: 2.5,
      isLoopable: false,
      hasAudio: false,
      transitionBehavior: 'wait_for_end',
      resolution: { width: 720, height: 720 },
      aspectRatio: '1:1',
      source: 'Canonical Aria Studio Reference (aria-portrait.webp)',
      license: 'CC0 / AI Companion Project',
    },
  ],
};

/**
 * Resolves candidate video clips from the manifest for a given interaction state and emotion.
 */
export function resolveCandidateClips(
  manifest: AvatarVideoManifest,
  state: AvatarInteractionState,
  emotion: AvatarEmotion = 'neutral'
): VideoAssetEntry[] {
  // 1. Direct match for state and emotion
  let matches = manifest.assets.filter((a) => a.state === state && a.emotion === emotion);
  if (matches.length > 0) return matches;

  // 2. Direct match for state alone
  matches = manifest.assets.filter((a) => a.state === state);
  if (matches.length > 0) return matches;

  // 3. Fallback for reaction states: match reaction by emotion
  if (state === 'reaction') {
    matches = manifest.assets.filter((a) => a.emotion === emotion);
    if (matches.length > 0) return matches;
  }

  // 4. Default fallback: idle clips
  return manifest.assets.filter((a) => a.state === 'idle');
}

/**
 * Selects a clip from candidates, avoiding immediate repetition of the previous clip if possible.
 */
export function pickNextClip(
  candidates: VideoAssetEntry[],
  currentClipId?: string
): VideoAssetEntry {
  if (candidates.length === 0) {
    throw new Error('No candidate video clips available in manifest');
  }
  if (candidates.length === 1 || !currentClipId) {
    const first = candidates[0];
    if (!first) {
      throw new Error('No candidate video clips available in manifest');
    }
    return first;
  }

  const filtered = candidates.filter((c) => c.id !== currentClipId);
  const pool = filtered.length > 0 ? filtered : candidates;
  const idx = Math.floor(Math.random() * pool.length);
  const selected = pool[idx] ?? candidates[0];
  if (!selected) {
    throw new Error('No candidate video clips available in manifest');
  }
  return selected;
}

