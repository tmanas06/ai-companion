/**
 * Avatar State Machine
 * ====================
 * Manages the deterministic lifecycle and transitions of the photorealistic video avatar.
 * Handles audio playback synchronization, hands-free loopback, emotion reactions, and interrupts.
 */

import { AvatarInteractionState, AvatarEmotion } from './avatar-video-manifest';

export type AvatarStateEvent =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'RECEIVE_RESPONSE'; emotion?: AvatarEmotion; intensity?: number }
  | { type: 'START_SPEAKING'; emotion?: AvatarEmotion }
  | { type: 'STOP_SPEAKING'; handsFree?: boolean }
  | { type: 'TRIGGER_EMOTION'; emotion: AvatarEmotion }
  | { type: 'EMOTION_COMPLETE' }
  | { type: 'INTERRUPT'; handsFree?: boolean }
  | { type: 'ERROR'; message?: string }
  | { type: 'RESET' };

export interface AvatarStateSnapshot {
  state: AvatarInteractionState;
  emotion: AvatarEmotion;
  isSpeaking: boolean;
  queuedEmotion: AvatarEmotion | null;
  lastError: string | null;
}

export const INITIAL_AVATAR_STATE: AvatarStateSnapshot = {
  state: 'idle',
  emotion: 'neutral',
  isSpeaking: false,
  queuedEmotion: null,
  lastError: null,
};

/**
 * Pure transition reducer for the avatar state machine.
 */
export function avatarStateReducer(
  current: AvatarStateSnapshot,
  event: AvatarStateEvent
): AvatarStateSnapshot {
  switch (event.type) {
    case 'START_LISTENING':
      return {
        ...current,
        state: 'listening',
        isSpeaking: false,
        lastError: null,
      };

    case 'STOP_LISTENING':
      // If moving from listening without processing, return to idle
      if (current.state === 'listening') {
        return {
          ...current,
          state: 'idle',
        };
      }
      return current;

    case 'START_PROCESSING':
      return {
        ...current,
        state: 'thinking',
        isSpeaking: false,
      };

    case 'RECEIVE_RESPONSE':
      return {
        ...current,
        queuedEmotion: event.emotion || 'neutral',
      };

    case 'START_SPEAKING':
      return {
        ...current,
        state: 'speaking',
        emotion: event.emotion || current.queuedEmotion || 'neutral',
        isSpeaking: true,
        queuedEmotion: null,
        lastError: null,
      };

    case 'STOP_SPEAKING': {
      const nextState: AvatarInteractionState = event.handsFree ? 'listening' : 'idle';
      return {
        ...current,
        state: nextState,
        isSpeaking: false,
        emotion: 'neutral',
        queuedEmotion: null,
      };
    }

    case 'TRIGGER_EMOTION':
      // If currently speaking, queue or blend; if idle/listening, play reaction
      if (current.isSpeaking) {
        return {
          ...current,
          emotion: event.emotion,
        };
      }
      return {
        ...current,
        state: 'reaction',
        emotion: event.emotion,
      };

    case 'EMOTION_COMPLETE':
      if (current.state === 'reaction' || current.state === 'greeting' || current.state === 'goodbye') {
        return {
          ...current,
          state: current.isSpeaking ? 'speaking' : 'idle',
          emotion: 'neutral',
        };
      }
      return current;

    case 'INTERRUPT': {
      const nextState: AvatarInteractionState = event.handsFree ? 'listening' : 'idle';
      return {
        ...current,
        state: nextState,
        isSpeaking: false,
        emotion: 'neutral',
        queuedEmotion: null,
      };
    }

    case 'ERROR':
      return {
        ...current,
        state: 'error',
        isSpeaking: false,
        lastError: event.message || 'Avatar error',
      };

    case 'RESET':
      return INITIAL_AVATAR_STATE;

    default:
      return current;
  }
}
