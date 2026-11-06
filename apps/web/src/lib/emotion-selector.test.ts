import {
  validateAvatarEmotion,
  analyzeClientConversationalEmotion,
} from './emotion-selector';

describe('Emotion Selector & Validator', () => {
  it('validates canonical emotions and aliases', () => {
    expect(validateAvatarEmotion('happy')).toBe('happy');
    expect(validateAvatarEmotion('JOY')).toBe('happy');
    expect(validateAvatarEmotion('excited')).toBe('happy');
    expect(validateAvatarEmotion('compassionate')).toBe('empathetic');
    expect(validateAvatarEmotion('unknown_garbage')).toBe('neutral');
    expect(validateAvatarEmotion(null)).toBe('neutral');
    expect(validateAvatarEmotion('')).toBe('neutral');
  });

  it('correctly maps empathetic emotion on grief/loss', () => {
    const res = analyzeClientConversationalEmotion(
      'I lost someone important to me yesterday.',
      'I am so sorry for your loss. I am here for you.'
    );
    expect(res.emotion).toBe('empathetic');
    expect(res.intensity).toBeGreaterThanOrEqual(0.8);
  });

  it('correctly maps happy emotion on good news', () => {
    const res = analyzeClientConversationalEmotion(
      'I finally got the job!',
      'That is wonderful news, congratulations!'
    );
    expect(res.emotion).toBe('happy');
    expect(res.intensity).toBeGreaterThanOrEqual(0.8);
  });

  it('correctly maps reassuring emotion on anxiety', () => {
    const res = analyzeClientConversationalEmotion(
      'I am feeling really anxious about tomorrow.',
      'Take a deep breath. You are doing great.'
    );
    expect(res.emotion).toBe('reassuring');
  });

  it('falls back to neutral for general conversational turns', () => {
    const res = analyzeClientConversationalEmotion(
      'Good morning Aria.',
      'Good morning! How are you doing today?'
    );
    expect(res.emotion).toBe('neutral');
  });
});
