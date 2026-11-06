/**
 * Emotion Selection & Mapping Utilities
 * =====================================
 * Validates, maps, and fallback-resolves conversational emotions for avatar animations.
 */

import { AvatarEmotion } from './avatar-video-manifest';

export const BOUNDED_EMOTIONS: readonly AvatarEmotion[] = [
  'neutral',
  'happy',
  'empathetic',
  'sad',
  'surprised',
  'curious',
  'confused',
  'laughing',
  'reassuring',
] as const;

/**
 * Validates an incoming emotion string, returning a valid AvatarEmotion.
 */
export function validateAvatarEmotion(raw?: string | null): AvatarEmotion {
  if (!raw) return 'neutral';
  const clean = raw.trim().toLowerCase();
  if (BOUNDED_EMOTIONS.includes(clean as AvatarEmotion)) {
    return clean as AvatarEmotion;
  }

  const aliasMap: Record<string, AvatarEmotion> = {
    joy: 'happy',
    excited: 'happy',
    cheerful: 'happy',
    compassionate: 'empathetic',
    caring: 'empathetic',
    sympathetic: 'empathetic',
    sorrow: 'sad',
    grieving: 'sad',
    amazed: 'surprised',
    inquisitive: 'curious',
    puzzled: 'confused',
    amused: 'laughing',
    playful: 'laughing',
    soothing: 'reassuring',
    calming: 'reassuring',
  };

  return aliasMap[clean] || 'neutral';
}

/**
 * Client-side semantic emotion analyzer (for offline or local fallback turns).
 */
export function analyzeClientConversationalEmotion(
  userText?: string,
  replyText?: string
): { emotion: AvatarEmotion; intensity: number } {
  const u = (userText || '').toLowerCase();
  const r = (replyText || '').toLowerCase();

  // 1. Empathetic: loss, grief, pain
  if (
    u.includes('lost someone') ||
    u.includes('passed away') ||
    u.includes('grief') ||
    r.includes('sorry for your loss') ||
    r.includes('my condolences')
  ) {
    return { emotion: 'empathetic', intensity: 0.85 };
  }

  // 2. Reassuring: anxiety, worry
  if (
    u.includes('anxious') ||
    u.includes('stressed') ||
    u.includes('worried') ||
    r.includes('take a deep breath') ||
    r.includes('you are doing great')
  ) {
    return { emotion: 'reassuring', intensity: 0.75 };
  }

  // 3. Laughing: humor, jokes
  if (u.includes('haha') || u.includes('hilarious') || r.includes('haha') || r.includes('too funny')) {
    return { emotion: 'laughing', intensity: 0.8 };
  }

  // 4. Happy: celebration, accomplishments
  if (
    u.includes('got the job') ||
    u.includes('congratulations') ||
    r.includes('wonderful news') ||
    r.includes('so proud')
  ) {
    return { emotion: 'happy', intensity: 0.85 };
  }

  // 5. Surprised
  if (u.includes('wow') || u.includes('unbelievable') || r.includes('incredible')) {
    return { emotion: 'surprised', intensity: 0.7 };
  }

  // 6. Confused
  if (u.includes("don't understand") || u.includes('confused') || u.includes("doesn't make sense")) {
    return { emotion: 'confused', intensity: 0.65 };
  }

  // 7. Curious
  if (u.includes('?') || u.includes('explain') || u.includes('how does')) {
    return { emotion: 'curious', intensity: 0.6 };
  }

  return { emotion: 'neutral', intensity: 0.5 };
}
