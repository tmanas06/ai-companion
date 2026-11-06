import {
  avatarStateReducer,
  INITIAL_AVATAR_STATE,
} from './avatar-state-machine';

describe('Avatar State Machine', () => {
  it('initializes in idle state', () => {
    expect(INITIAL_AVATAR_STATE.state).toBe('idle');
    expect(INITIAL_AVATAR_STATE.emotion).toBe('neutral');
    expect(INITIAL_AVATAR_STATE.isSpeaking).toBe(false);
  });

  it('transitions idle -> listening -> thinking -> speaking -> idle', () => {
    let state = INITIAL_AVATAR_STATE;

    // User starts talking
    state = avatarStateReducer(state, { type: 'START_LISTENING' });
    expect(state.state).toBe('listening');

    // Speech completed, waiting for AI response
    state = avatarStateReducer(state, { type: 'START_PROCESSING' });
    expect(state.state).toBe('thinking');

    // Response received with happy emotion
    state = avatarStateReducer(state, { type: 'RECEIVE_RESPONSE', emotion: 'happy' });
    expect(state.queuedEmotion).toBe('happy');
    expect(state.state).toBe('thinking');

    // TTS Audio starts playing
    state = avatarStateReducer(state, { type: 'START_SPEAKING' });
    expect(state.state).toBe('speaking');
    expect(state.isSpeaking).toBe(true);
    expect(state.emotion).toBe('happy');
    expect(state.queuedEmotion).toBeNull();

    // Audio finishes (push-to-talk mode)
    state = avatarStateReducer(state, { type: 'STOP_SPEAKING', handsFree: false });
    expect(state.state).toBe('idle');
    expect(state.isSpeaking).toBe(false);
  });

  it('transitions to listening on speech completion when hands-free is enabled', () => {
    let state = avatarStateReducer(INITIAL_AVATAR_STATE, { type: 'START_SPEAKING' });
    expect(state.isSpeaking).toBe(true);

    state = avatarStateReducer(state, { type: 'STOP_SPEAKING', handsFree: true });
    expect(state.state).toBe('listening');
    expect(state.isSpeaking).toBe(false);
  });

  it('promptly handles interruption while speaking', () => {
    let state = avatarStateReducer(INITIAL_AVATAR_STATE, { type: 'START_SPEAKING', emotion: 'laughing' });
    expect(state.state).toBe('speaking');
    expect(state.emotion).toBe('laughing');

    state = avatarStateReducer(state, { type: 'INTERRUPT', handsFree: true });
    expect(state.state).toBe('listening');
    expect(state.isSpeaking).toBe(false);
    expect(state.emotion).toBe('neutral');
  });

  it('handles explicit emotion trigger and completion', () => {
    let state = avatarStateReducer(INITIAL_AVATAR_STATE, { type: 'TRIGGER_EMOTION', emotion: 'empathetic' });
    expect(state.state).toBe('reaction');
    expect(state.emotion).toBe('empathetic');

    state = avatarStateReducer(state, { type: 'EMOTION_COMPLETE' });
    expect(state.state).toBe('idle');
    expect(state.emotion).toBe('neutral');
  });

  it('transitions to error state and recovers gracefully on reset', () => {
    let state = avatarStateReducer(INITIAL_AVATAR_STATE, { type: 'ERROR', message: 'Video decode failed' });
    expect(state.state).toBe('error');
    expect(state.lastError).toBe('Video decode failed');

    state = avatarStateReducer(state, { type: 'RESET' });
    expect(state).toEqual(INITIAL_AVATAR_STATE);
  });
});
