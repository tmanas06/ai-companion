export type VoiceGender = 'male' | 'female' | 'unknown';

export interface NeuralVoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
  recommendedFor?: string;
}

export const NEURAL_VOICES: NeuralVoiceOption[] = [
  // Male Neural Voices
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (Natural & Confident)',
    gender: 'male',
    description: 'Deep, clear, and commanding tone with natural resonance',
    recommendedFor: 'Marcus',
  },
  {
    id: 'en-US-ChristopherNeural',
    name: 'Christopher (Warm & Grounded)',
    gender: 'male',
    description: 'Philosophical, calm, and trustworthy deep voice',
    recommendedFor: 'Atlas',
  },
  {
    id: 'en-US-AndrewNeural',
    name: 'Andrew (Upbeat & Energetic)',
    gender: 'male',
    description: 'Modern, lively, and engaging cadence',
    recommendedFor: 'Kai',
  },
  {
    id: 'en-US-BrianNeural',
    name: 'Brian (Natural & Articulate)',
    gender: 'male',
    description: 'Smooth conversational tone for daily discussions',
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan (British Charismatic)',
    gender: 'male',
    description: 'Sophisticated British accent with witty warmth',
  },

  // Female Neural Voices
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (Warm & Empathetic)',
    gender: 'female',
    description: 'Gentle, emotionally supportive, and compassionate',
    recommendedFor: 'Aria',
  },
  {
    id: 'en-US-AvaNeural',
    name: 'Ava (Expressive & Sweet)',
    gender: 'female',
    description: 'Bright, youthful, and whimsical cadence',
    recommendedFor: 'Luna',
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria (Crisp & Radiant)',
    gender: 'female',
    description: 'Clear, modern, and engaging tone for thoughtful ideas',
    recommendedFor: 'Nova',
  },
  {
    id: 'en-US-MichelleNeural',
    name: 'Michelle (Calm & Soothing)',
    gender: 'female',
    description: 'Serene, contemplative, and peaceful presence',
    recommendedFor: 'Sage',
  },
  {
    id: 'en-CA-ClaraNeural',
    name: 'Clara (Vibrant & Cheerful)',
    gender: 'female',
    description: 'Playful, enthusiastic, and inspiring melody',
    recommendedFor: 'Maya',
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia (British Melodic)',
    gender: 'female',
    description: 'Poetic, graceful British cadence',
  },
];

export interface ElevenLabsVoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
  recommendedFor?: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoiceOption[] = [
  // Male ElevenLabs voices
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam (Deep & Narrative)',
    gender: 'male',
    description: 'Deep, resonant, confident conversational tone — classic natural narrator',
    recommendedFor: 'Marcus',
  },
  {
    id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George (Warm & Articulate)',
    gender: 'male',
    description: 'Warm, mature, articulate cadence with thoughtful gravitas',
    recommendedFor: 'Atlas',
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam (Energetic & Youthful)',
    gender: 'male',
    description: 'Lively, youthful cadence with expressive warmth and energy',
    recommendedFor: 'Kai',
  },
  {
    id: 'bIHbv24MWmeRgasZH58o',
    name: 'Will (Friendly & Conversational)',
    gender: 'male',
    description: 'Relaxed, friendly, everyday conversational presence',
  },
  {
    id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie (Natural & Casual)',
    gender: 'male',
    description: 'Casual, confident conversational cadence',
  },

  // Female ElevenLabs voices
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (Warm & Expressive)',
    gender: 'female',
    description: 'Warm, calm, empathetic, and lifelike — ElevenLabs premier female voice',
    recommendedFor: 'Aria',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah (Soft & Expressive)',
    gender: 'female',
    description: 'Soft, gentle, intimate, and emotionally rich',
    recommendedFor: 'Luna',
  },
  {
    id: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte (Crisp & Radiant)',
    gender: 'female',
    description: 'Crisp, radiant, modern, and engaging tone with vibrant clarity',
    recommendedFor: 'Nova',
  },
  {
    id: 'pFZP5JQG7iQjIQuC4Bku',
    name: 'Lily (Soothing & Contemplative)',
    gender: 'female',
    description: 'Serene, contemplative, quiet, and peaceful presence',
    recommendedFor: 'Sage',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica (Bright & Cheerful)',
    gender: 'female',
    description: 'Playful, enthusiastic, friendly, and uplifting melody',
    recommendedFor: 'Maya',
  },
];

export function getRecommendedElevenLabsVoice(
  companionName?: string,
  gender: 'male' | 'female' = 'female'
): string {
  const name = (companionName || '').toLowerCase().trim();
  const match = ELEVENLABS_VOICES.find((v) => v.recommendedFor?.toLowerCase() === name);
  if (match) return match.id;
  return gender === 'male' ? 'pNInz6obpgDQGcFmaJgB' : '21m00Tcm4TlvDq8ikWAM';
}

export function isVoiceMatchingGender(
  voiceIdOrName: string | undefined,
  gender: 'male' | 'female'
): boolean {
  if (!voiceIdOrName) return false;
  const v = voiceIdOrName.toLowerCase().trim();

  // Explicit male IDs and markers
  const maleMarkers = [
    'pninz6obpgdqgcfmajgb', // Adam
    'jbfqncbsd6rmkjvdrzzb', // George
    'tx3lpaxmhkxfdv7voqhj', // Liam
    'bihbv24mwmergaszh58o', // Will
    'ikne3meq5asn9xlyudcd', // Charlie
    'en-us-guyneural',
    'en-us-christopherneural',
    'en-us-andrewneural',
    'en-us-brianneural',
    'en-gb-ryanneural',
    'guy',
    'adam',
    'george',
    'liam',
    'will',
    'charlie',
    'marcus',
    'atlas',
    'kai',
  ];

  // Explicit female IDs and markers
  const femaleMarkers = [
    '21m00tcm4tlvdq8ikwam', // Rachel
    'exavitqu4vr4xnsdxmal', // Sarah
    'xb0fdunxu5powfxdhcwa', // Charlotte
    'pfzp5jqg7iqjiquc4bku', // Lily
    'cgsgspj2msm6clmckdw9', // Jessica
    'en-us-jennyneural',
    'en-us-avaneural',
    'en-us-arianeural',
    'en-us-michelleneural',
    'en-ca-claraneural',
    'en-gb-sonianeural',
    'rachel',
    'sarah',
    'charlotte',
    'lily',
    'jessica',
    'jenny',
    'ava',
    'aria',
    'luna',
    'nova',
    'sage',
    'maya',
  ];

  const isMale = maleMarkers.some((id) => v === id || v.includes(id));
  const isFemale = femaleMarkers.some((id) => v === id || v.includes(id));

  if (gender === 'male') {
    return isMale && !isFemale;
  } else {
    return isFemale && !isMale;
  }
}

export function getRecommendedNeuralVoice(companionName?: string, gender: 'male' | 'female' = 'female'): string {
  const name = (companionName || '').toLowerCase().trim();
  const match = NEURAL_VOICES.find((v) => v.recommendedFor?.toLowerCase() === name);
  if (match) return match.id;
  return gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural';
}

export interface CompanionVoiceProfile {
  pitch: number;
  speechRate: number;
  preferredKeywords: string[];
  neuralVoice: string;
  elevenLabsVoice: string;
}

/**
 * Classifies a browser SpeechSynthesisVoice by gender based on name, voiceURI, and metadata.
 */
export function classifyVoiceGender(voice: SpeechSynthesisVoice): VoiceGender {
  const name = voice.name.toLowerCase();
  const uri = (voice.voiceURI || '').toLowerCase();

  // Explicit male markers
  if (
    (name.includes('male') && !name.includes('female')) ||
    (uri.includes('male') && !uri.includes('female')) ||
    name.includes('david') ||
    name.includes('mark') ||
    name.includes('guy') ||
    name.includes('ryan') ||
    name.includes('george') ||
    name.includes('alex') ||
    name.includes('daniel') ||
    name.includes('oliver') ||
    name.includes('fred') ||
    name.includes('tom') ||
    name.includes('john') ||
    name.includes('michael') ||
    name.includes('paul') ||
    name.includes('james') ||
    name.includes('richard') ||
    name.includes('steven') ||
    name.includes('brian') ||
    name.includes('christopher') ||
    name.includes('arthur') ||
    name.includes('jacky') ||
    name.includes('norbert') ||
    name.includes('sandro') ||
    name.includes('travis') ||
    name.includes('victor')
  ) {
    return 'male';
  }

  // Explicit female markers
  if (
    name.includes('female') ||
    uri.includes('female') ||
    name.includes('zira') ||
    name.includes('jenny') ||
    name.includes('samantha') ||
    name.includes('victoria') ||
    name.includes('karen') ||
    name.includes('susan') ||
    name.includes('linda') ||
    name.includes('aria') ||
    name.includes('sonia') ||
    name.includes('clara') ||
    name.includes('stephanie') ||
    name.includes('emma') ||
    name.includes('amy') ||
    name.includes('joanna') ||
    name.includes('kendra') ||
    name.includes('catherine') ||
    name.includes('heather') ||
    name.includes('anika') ||
    name.includes('steph')
  ) {
    return 'female';
  }

  return 'unknown';
}

/**
 * Voice profiles tailored per companion character: distinct pitch, rate, and preferred voice keywords.
 */
export const COMPANION_VOICE_PROFILES: Record<string, CompanionVoiceProfile> = {
  aria: {
    pitch: 1.0,
    speechRate: 0.98,
    preferredKeywords: ['samantha', 'zira', 'female1', 'natural', 'aria'],
    neuralVoice: 'en-US-JennyNeural',
    elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
  },
  marcus: {
    pitch: 0.92,
    speechRate: 0.95,
    preferredKeywords: ['david', 'daniel', 'alex', 'male1', 'guy'],
    neuralVoice: 'en-US-GuyNeural',
    elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB',
  },
  luna: {
    pitch: 1.08,
    speechRate: 1.02,
    preferredKeywords: ['victoria', 'jenny', 'female2', 'steph', 'anika'],
    neuralVoice: 'en-US-AvaNeural',
    elevenLabsVoice: 'EXAVITQu4vr4xnSDxMaL',
  },
  kai: {
    pitch: 0.96,
    speechRate: 1.04,
    preferredKeywords: ['mark', 'oliver', 'ryan', 'male2', 'fred'],
    neuralVoice: 'en-US-AndrewNeural',
    elevenLabsVoice: 'TX3LPaxmHKxFdv7VOQHJ',
  },
  nova: {
    pitch: 1.06,
    speechRate: 1.02,
    preferredKeywords: ['google', 'clara', 'sonia', 'female3', 'natural'],
    neuralVoice: 'en-US-AriaNeural',
    elevenLabsVoice: 'XB0fDUnXU5powFXDhCwa',
  },
  atlas: {
    pitch: 0.90,
    speechRate: 0.92,
    preferredKeywords: ['george', 'guy', 'male3', 'arthur', 'richard'],
    neuralVoice: 'en-US-ChristopherNeural',
    elevenLabsVoice: 'JBFqnCBsd6RMkjVDRZzb',
  },
  sage: {
    pitch: 0.98,
    speechRate: 0.94,
    preferredKeywords: ['karen', 'amy', 'female4', 'susan', 'linda'],
    neuralVoice: 'en-US-MichelleNeural',
    elevenLabsVoice: 'pFZP5JQG7iQjIQuC4Bku',
  },
  maya: {
    pitch: 1.04,
    speechRate: 1.04,
    preferredKeywords: ['clara', 'emma', 'joanna', 'female5', 'victoria', 'jenny'],
    neuralVoice: 'en-CA-ClaraNeural',
    elevenLabsVoice: 'cgSgspJ2msm6clMCkdW9',
  },
};

/**
 * Get distinct companion voice profile with fallback defaults based on gender.
 */
export function getCompanionVoiceProfile(
  companionName?: string,
  gender: 'male' | 'female' = 'female'
): CompanionVoiceProfile {
  const key = (companionName || '').trim().toLowerCase();
  if (COMPANION_VOICE_PROFILES[key]) {
    return COMPANION_VOICE_PROFILES[key];
  }

  // Fallbacks for custom companions
  if (gender === 'male') {
    return {
      pitch: 0.92,
      speechRate: 0.96,
      preferredKeywords: ['david', 'male', 'guy', 'daniel', 'alex'],
      neuralVoice: 'en-US-GuyNeural',
      elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB',
    };
  }

  return {
    pitch: 1.02,
    speechRate: 1.0,
    preferredKeywords: ['female', 'samantha', 'zira', 'jenny', 'victoria'],
    neuralVoice: 'en-US-JennyNeural',
    elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
  };
}

/**
 * Resolves the best SpeechSynthesisVoice matching the companion's gender and persona.
 * Guarantees male avatars get male voices, and female avatars get female voices.
 */
export function selectVoiceForCompanion(
  voices: SpeechSynthesisVoice[],
  gender: 'male' | 'female',
  companionName?: string,
  preferredVoiceName?: string
): { voice: SpeechSynthesisVoice | null; pitch: number; speechRate: number } {
  const profile = getCompanionVoiceProfile(companionName, gender);

  if (!voices || voices.length === 0) {
    return { voice: null, pitch: profile.pitch, speechRate: profile.speechRate };
  }

  // 1. If user explicitly picked a voice by name, check if it exists
  if (preferredVoiceName) {
    const explicit = voices.find(
      (v) => v.name === preferredVoiceName || v.voiceURI === preferredVoiceName
    );
    if (explicit) {
      return { voice: explicit, pitch: profile.pitch, speechRate: profile.speechRate };
    }
  }

  // 2. Filter voices by language (prefer English if available)
  const langVoices = voices.filter((v) => v.lang.startsWith('en')).length > 0
    ? voices.filter((v) => v.lang.startsWith('en'))
    : voices;

  // 3. Partition voices by detected gender
  const maleVoices = langVoices.filter((v) => classifyVoiceGender(v) === 'male');
  const femaleVoices = langVoices.filter((v) => classifyVoiceGender(v) === 'female');
  const neutralVoices = langVoices.filter((v) => classifyVoiceGender(v) === 'unknown');

  const candidatePool = gender === 'male' ? maleVoices : femaleVoices;

  let chosenVoice: SpeechSynthesisVoice | null = null;

  // 4. Try matching preferred keywords for this character
  if (candidatePool.length > 0) {
    for (const kw of profile.preferredKeywords) {
      const match = candidatePool.find((v) => v.name.toLowerCase().includes(kw));
      if (match) {
        chosenVoice = match;
        break;
      }
    }
    if (!chosenVoice) {
      chosenVoice = candidatePool[0] || null;
    }
  }

  // 5. If no voice with matching gender tag exists, fall back to neutral pool
  if (!chosenVoice && neutralVoices.length > 0) {
    chosenVoice = neutralVoices[0] || null;
  }

  // 6. Absolute fallback
  if (!chosenVoice) {
    chosenVoice = langVoices[0] || null;
  }

  // Ensure masculine pitch modifier if male avatar has only neutral/single voice
  let effectivePitch = profile.pitch;
  if (gender === 'male' && chosenVoice && classifyVoiceGender(chosenVoice) !== 'male') {
    effectivePitch = Math.min(effectivePitch, 0.90);
  } else if (gender === 'female' && chosenVoice && classifyVoiceGender(chosenVoice) === 'male') {
    effectivePitch = Math.max(effectivePitch, 1.08);
  }

  return {
    voice: chosenVoice,
    pitch: effectivePitch,
    speechRate: profile.speechRate,
  };
}
