import {
  classifyVoiceGender,
  selectVoiceForCompanion,
  getCompanionVoiceProfile,
  getRecommendedNeuralVoice,
  getRecommendedElevenLabsVoice,
  isVoiceMatchingGender,
  NEURAL_VOICES,
  ELEVENLABS_VOICES,
} from './voice-manager';
import { inferCompanionGender, COMPANION_PRESETS } from './companion-presets';

describe('Voice Manager & Gender Resolution', () => {
  const mockVoices = [
    {
      name: 'Microsoft David - English (United States)',
      voiceURI: 'Microsoft David - English (United States)',
      lang: 'en-US',
      localService: true,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Microsoft Zira - English (United States)',
      voiceURI: 'Microsoft Zira - English (United States)',
      lang: 'en-US',
      localService: true,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Google UK English Male',
      voiceURI: 'Google UK English Male',
      lang: 'en-GB',
      localService: false,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Google UK English Female',
      voiceURI: 'Google UK English Female',
      lang: 'en-GB',
      localService: false,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Alex',
      voiceURI: 'Alex',
      lang: 'en-US',
      localService: true,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Samantha',
      voiceURI: 'Samantha',
      lang: 'en-US',
      localService: true,
      default: false,
    } as SpeechSynthesisVoice,
  ];

  describe('classifyVoiceGender', () => {
    it('classifies male voices correctly', () => {
      expect(classifyVoiceGender(mockVoices[0]!)).toBe('male'); // David
      expect(classifyVoiceGender(mockVoices[2]!)).toBe('male'); // Google UK Male
      expect(classifyVoiceGender(mockVoices[4]!)).toBe('male'); // Alex
    });

    it('classifies female voices correctly', () => {
      expect(classifyVoiceGender(mockVoices[1]!)).toBe('female'); // Zira
      expect(classifyVoiceGender(mockVoices[3]!)).toBe('female'); // Google UK Female
      expect(classifyVoiceGender(mockVoices[5]!)).toBe('female'); // Samantha
    });

    it('returns unknown for ambiguous system voice without gender tags', () => {
      const neutralVoice = {
        name: 'default',
        voiceURI: 'urn:moz-tts:speechd:default',
        lang: 'en-US',
      } as SpeechSynthesisVoice;
      expect(classifyVoiceGender(neutralVoice)).toBe('unknown');
    });
  });

  describe('selectVoiceForCompanion', () => {
    it('guarantees male avatar receives male voice and masculine pitch', () => {
      const result = selectVoiceForCompanion(mockVoices, 'male', 'Marcus');
      expect(classifyVoiceGender(result.voice!)).toBe('male');
      expect(result.pitch).toBeLessThanOrEqual(0.92);
    });

    it('guarantees female avatar receives female voice and feminine pitch', () => {
      const result = selectVoiceForCompanion(mockVoices, 'female', 'Luna');
      expect(classifyVoiceGender(result.voice!)).toBe('female');
      expect(result.pitch).toBeGreaterThanOrEqual(1.0);
    });

    it('lowers pitch to masculine register (<= 0.90) if male avatar only has neutral voice', () => {
      const singleNeutralVoice = [
        {
          name: 'System Default Speech',
          voiceURI: 'sys_default',
          lang: 'en-US',
        } as SpeechSynthesisVoice,
      ];
      const result = selectVoiceForCompanion(singleNeutralVoice, 'male', 'Atlas');
      expect(result.voice).toBe(singleNeutralVoice[0]);
      expect(result.pitch).toBeLessThanOrEqual(0.90);
    });

    it('gives distinct voice profiles to different companions', () => {
      const marcusProfile = getCompanionVoiceProfile('Marcus', 'male');
      const lunaProfile = getCompanionVoiceProfile('Luna', 'female');
      const atlasProfile = getCompanionVoiceProfile('Atlas', 'male');
      const ariaProfile = getCompanionVoiceProfile('Aria', 'female');

      expect(marcusProfile.pitch).not.toEqual(lunaProfile.pitch);
      expect(marcusProfile.pitch).not.toEqual(atlasProfile.pitch);
      expect(ariaProfile.pitch).not.toEqual(lunaProfile.pitch);
      expect(marcusProfile.speechRate).not.toEqual(lunaProfile.speechRate);
      expect(marcusProfile.neuralVoice).toBe('en-US-GuyNeural');
      expect(atlasProfile.neuralVoice).toBe('en-US-ChristopherNeural');
      expect(ariaProfile.neuralVoice).toBe('en-US-JennyNeural');
    });

    it('recommends correct neural voice per companion character and gender', () => {
      expect(getRecommendedNeuralVoice('Marcus', 'male')).toBe('en-US-GuyNeural');
      expect(getRecommendedNeuralVoice('Atlas', 'male')).toBe('en-US-ChristopherNeural');
      expect(getRecommendedNeuralVoice('Kai', 'male')).toBe('en-US-AndrewNeural');
      expect(getRecommendedNeuralVoice('Aria', 'female')).toBe('en-US-JennyNeural');
      expect(getRecommendedNeuralVoice('Luna', 'female')).toBe('en-US-AvaNeural');
      expect(getRecommendedNeuralVoice('Nova', 'female')).toBe('en-US-AriaNeural');
      expect(getRecommendedNeuralVoice('Sage', 'female')).toBe('en-US-MichelleNeural');
      expect(getRecommendedNeuralVoice('Maya', 'female')).toBe('en-CA-ClaraNeural');

      // Unknown character fallbacks
      expect(getRecommendedNeuralVoice('Custom Guy', 'male')).toBe('en-US-GuyNeural');
      expect(getRecommendedNeuralVoice('Custom Girl', 'female')).toBe('en-US-JennyNeural');
    });

    it('contains properly structured neural voice options in NEURAL_VOICES', () => {
      expect(NEURAL_VOICES.length).toBeGreaterThan(5);
      NEURAL_VOICES.forEach((v) => {
        expect(['male', 'female']).toContain(v.gender);
        expect(v.id).toMatch(/^en-[A-Z]{2}-/);
        expect(v.name.length).toBeGreaterThan(0);
      });
    });

    it('contains properly structured ElevenLabs voice options in ELEVENLABS_VOICES', () => {
      expect(ELEVENLABS_VOICES.length).toBeGreaterThanOrEqual(10);
      ELEVENLABS_VOICES.forEach((v) => {
        expect(['male', 'female']).toContain(v.gender);
        expect(v.id.length).toBeGreaterThan(10);
        expect(v.name.length).toBeGreaterThan(0);
      });
    });

    it('recommends correct ElevenLabs voice per companion character and gender', () => {
      expect(getRecommendedElevenLabsVoice('Marcus', 'male')).toBe('pNInz6obpgDQGcFmaJgB'); // Adam
      expect(getRecommendedElevenLabsVoice('Atlas', 'male')).toBe('JBFqnCBsd6RMkjVDRZzb');  // George
      expect(getRecommendedElevenLabsVoice('Kai', 'male')).toBe('TX3LPaxmHKxFdv7VOQHJ');    // Liam
      expect(getRecommendedElevenLabsVoice('Aria', 'female')).toBe('21m00Tcm4TlvDq8ikWAM'); // Rachel
      expect(getRecommendedElevenLabsVoice('Luna', 'female')).toBe('EXAVITQu4vr4xnSDxMaL'); // Sarah
      expect(getRecommendedElevenLabsVoice('Nova', 'female')).toBe('XB0fDUnXU5powFXDhCwa'); // Charlotte
      expect(getRecommendedElevenLabsVoice('Sage', 'female')).toBe('pFZP5JQG7iQjIQuC4Bku'); // Lily
      expect(getRecommendedElevenLabsVoice('Maya', 'female')).toBe('cgSgspJ2msm6clMCkdW9'); // Jessica

      // Custom fallbacks
      expect(getRecommendedElevenLabsVoice('Custom Man', 'male')).toBe('pNInz6obpgDQGcFmaJgB');
      expect(getRecommendedElevenLabsVoice('Custom Woman', 'female')).toBe('21m00Tcm4TlvDq8ikWAM');
    });

    it('strictly checks voice gender matching with isVoiceMatchingGender', () => {
      // Male voices
      expect(isVoiceMatchingGender('pNInz6obpgDQGcFmaJgB', 'male')).toBe(true);
      expect(isVoiceMatchingGender('en-US-GuyNeural', 'male')).toBe(true);
      expect(isVoiceMatchingGender('Adam', 'male')).toBe(true);
      expect(isVoiceMatchingGender('21m00Tcm4TlvDq8ikWAM', 'male')).toBe(false);
      expect(isVoiceMatchingGender('en-US-JennyNeural', 'male')).toBe(false);
      expect(isVoiceMatchingGender('Rachel', 'male')).toBe(false);

      // Female voices
      expect(isVoiceMatchingGender('21m00Tcm4TlvDq8ikWAM', 'female')).toBe(true);
      expect(isVoiceMatchingGender('en-US-JennyNeural', 'female')).toBe(true);
      expect(isVoiceMatchingGender('Rachel', 'female')).toBe(true);
      expect(isVoiceMatchingGender('pNInz6obpgDQGcFmaJgB', 'female')).toBe(false);
      expect(isVoiceMatchingGender('en-US-GuyNeural', 'female')).toBe(false);
      expect(isVoiceMatchingGender('Adam', 'female')).toBe(false);
    });
  });

  describe('inferCompanionGender', () => {
    it('infers male for male character names', () => {
      expect(inferCompanionGender({ name: 'Marcus' })).toBe('male');
      expect(inferCompanionGender({ name: 'Kai' })).toBe('male');
      expect(inferCompanionGender({ name: 'Atlas' })).toBe('male');
    });

    it('infers female for female character names', () => {
      expect(inferCompanionGender({ name: 'Aria' })).toBe('female');
      expect(inferCompanionGender({ name: 'Luna' })).toBe('female');
      expect(inferCompanionGender({ name: 'Nova' })).toBe('female');
      expect(inferCompanionGender({ name: 'Maya' })).toBe('female');
      expect(inferCompanionGender({ name: 'Sage' })).toBe('female');
    });

    it('respects explicit personality.gender property', () => {
      expect(
        inferCompanionGender({
          name: 'Custom Character',
          personality: { gender: 'male' },
        })
      ).toBe('male');
      expect(
        inferCompanionGender({
          name: 'Custom Character',
          personality: { gender: 'female' },
        })
      ).toBe('female');
    });

    it('ensures all COMPANION_PRESETS have valid gender defined', () => {
      COMPANION_PRESETS.forEach((preset) => {
        expect(['male', 'female']).toContain(preset.gender);
        if (preset.id === 'marcus' || preset.id === 'kai' || preset.id === 'atlas') {
          expect(preset.gender).toBe('male');
        } else {
          expect(preset.gender).toBe('female');
        }
      });
    });
  });
});
