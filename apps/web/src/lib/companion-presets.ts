import { AvatarConfig } from '@/components/companion/AvatarRenderer';

export interface CompanionPersonalityConfig {
  style?: string;
  avatar_style?: string;
  avatar_preview_url?: string;
  avatar_config?: AvatarConfig;
  traits?: string[];
  bio?: string;
  tagline?: string;
  gender?: 'male' | 'female';
  voice_preset?: {
    pitch?: number;
    speechRate?: number;
    preferredVoiceName?: string;
  };
}

export interface CompanionPreset {
  id: string;
  name: string;
  gender: 'male' | 'female';
  style: 'photorealistic' | 'anime' | '3d' | 'illustrated';
  previewUrl: string;
  tagline: string;
  bio: string;
  traits: string[];
  config: AvatarConfig;
  defaultPitch?: number;
  defaultSpeechRate?: number;
}

export type AvatarPreset = CompanionPreset;

export const PERSONALITY_TRAITS = [
  { id: 'Caring', label: 'Caring', description: 'Empathetic, nurturing, and emotionally supportive.', color: 'emerald' },
  { id: 'Playful', label: 'Playful', description: 'Fun-loving, witty, and brings joy to daily moments.', color: 'pink' },
  { id: 'Affectionate', label: 'Affectionate', description: 'Warm, deeply loyal, and expressive.', color: 'rose' },
  { id: 'Intelligent', label: 'Intelligent', description: 'Insightful, analytical, and curious about big ideas.', color: 'indigo' },
  { id: 'Calm', label: 'Calm', description: 'Grounded, peaceful, and a soothing presence.', color: 'sky' },
  { id: 'Humorous', label: 'Humorous', description: 'Quick-witted, uplifting, and loves a good laugh.', color: 'amber' },
  { id: 'Confident', label: 'Confident', description: 'Bold, motivating, and inspires self-assurance.', color: 'violet' },
  { id: 'Thoughtful', label: 'Thoughtful', description: 'Reflective, considerate, and attentive to details.', color: 'teal' },
  { id: 'Adventurous', label: 'Adventurous', description: 'Daring, enthusiastic, and ready for exploration.', color: 'orange' },
];

export const AVATAR_STYLES = [
  { id: 'all', label: 'All Styles' },
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'anime', label: 'Anime' },
  { id: '3d', label: '3D' },
  { id: 'illustrated', label: 'Illustrated' },
] as const;

export const APPEARANCE_OPTIONS = {
  skinTones: [
    { label: 'Light', value: '#fed7aa', variant: 'light' },
    { label: 'Medium-Light', value: '#fdba74', variant: 'medium-light' },
    { label: 'Warm Bronze', value: '#C68642', variant: 'bronze' },
    { label: 'Tan', value: '#b45309', variant: 'medium-dark' },
    { label: 'Deep', value: '#5D3A1A', variant: 'dark' },
  ],
  hairStyles: [
    { label: 'Flowing Locks', variant: 'flowing' },
    { label: 'Short & Sleek', variant: 'short' },
    { label: 'Anime Spikes', variant: 'anime-spikes' },
    { label: 'Natural Curls', variant: 'curly' },
    { label: 'High Ponytail', variant: 'ponytail' },
  ],
  hairColors: [
    { label: 'Raven Black', color: '#18181b' },
    { label: 'Chestnut Brown', color: '#78350f' },
    { label: 'Platinum Blonde', color: '#fef08a' },
    { label: 'Lavender Violet', color: '#c084fc' },
    { label: 'Celestial Cyan', color: '#38bdf8' },
    { label: 'Emerald Green', color: '#0d9488' },
    { label: 'Fiery Copper', color: '#ea580c' },
  ],
  eyeShapes: [
    { label: 'Almond', variant: 'almond' },
    { label: 'Round & Bright', variant: 'round' },
    { label: 'Smiling Eyes', variant: 'smiling' },
  ],
  eyeColors: [
    { label: 'Sapphire Blue', color: '#2563eb' },
    { label: 'Emerald Green', color: '#059669' },
    { label: 'Deep Hazel', color: '#92400e' },
    { label: 'Amethyst Violet', color: '#9333ea' },
    { label: 'Golden Amber', color: '#d97706' },
    { label: 'Charcoal Grey', color: '#334155' },
  ],
  clothingStyles: [
    { label: 'Casual Hoodie', variant: 'casual', color: '#1e293b' },
    { label: 'Smart Blazer', variant: 'blazer', color: '#0f172a' },
    { label: 'Cozy Knit', variant: 'casual', color: '#7c2d12' },
    { label: 'Futuristic Cyber', variant: 'futuristic', color: '#0369a1' },
  ],
  accessories: [
    { label: 'None', variant: 'none' },
    { label: 'Classic Glasses', variant: 'glasses', color: '#facc15' },
    { label: 'Stud Earrings', variant: 'earrings', color: '#fbbf24' },
    { label: 'Pro Headphones', variant: 'headphones', color: '#06b6d4' },
  ],
  backgrounds: [
    { label: 'Cosmic Indigo', color: '#4338ca' },
    { label: 'Midnight Teal', color: '#0f766e' },
    { label: 'Sunset Rose', color: '#db2777' },
    { label: 'Deep Obsidian', color: '#1e293b' },
    { label: 'Forest Green', color: '#15803d' },
  ],
};

export const COMPANION_PRESETS: CompanionPreset[] = [
  {
    id: 'aria',
    name: 'Aria',
    gender: 'female',
    style: 'photorealistic',
    previewUrl: '/avatars/aria-portrait.webp',
    tagline: 'Empathetic listener & thoughtful confidant',
    bio: 'A mindful and deeply empathetic companion who values meaningful conversations, active listening, and calm reflection.',
    traits: ['Caring', 'Thoughtful', 'Calm'],
    defaultPitch: 1.0,
    defaultSpeechRate: 0.98,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#1e1b4b' },
        { type: 'skin', variant: 'medium-light', color: '#fdba74' },
        { type: 'hair', variant: 'flowing', color: '#78350f' },
        { type: 'eyes', variant: 'almond', color: '#1e3a8a' },
        { type: 'clothing', variant: 'blazer', color: '#1e293b' },
        { type: 'accessory', variant: 'earrings', color: '#fef08a' },
      ],
    },
  },
  {
    id: 'marcus',
    name: 'Marcus',
    gender: 'male',
    style: 'photorealistic',
    previewUrl: '/avatars/marcus-portrait.webp',
    tagline: 'Strategic thinker & ambitious mentor',
    bio: 'Sharp, focused, and quietly confident. Marcus is passionate about personal growth, deep philosophy, and strategic problem-solving.',
    traits: ['Intelligent', 'Confident', 'Calm'],
    defaultPitch: 0.88,
    defaultSpeechRate: 0.95,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#18181b' },
        { type: 'skin', variant: 'bronze', color: '#b45309' },
        { type: 'hair', variant: 'short', color: '#18181b' },
        { type: 'eyes', variant: 'almond', color: '#451a03' },
        { type: 'clothing', variant: 'blazer', color: '#0f172a' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'luna',
    name: 'Luna',
    gender: 'female',
    style: 'photorealistic',
    previewUrl: '/avatars/elena-portrait.webp',
    tagline: 'Vibrant dreamer & creative spirit',
    bio: 'Full of whimsical ideas, infectious curiosity, and heartfelt loyalty. Luna loves stargazing, storytelling, and brightening your day.',
    traits: ['Playful', 'Affectionate', 'Adventurous'],
    defaultPitch: 1.15,
    defaultSpeechRate: 1.05,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#7c3aed' },
        { type: 'skin', variant: 'light', color: '#fecdd3' },
        { type: 'hair', variant: 'flowing', color: '#c084fc' },
        { type: 'eyes', variant: 'round', color: '#db2777' },
        { type: 'clothing', variant: 'casual', color: '#18181b' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'kai',
    name: 'Kai',
    gender: 'male',
    style: 'photorealistic',
    previewUrl: '/avatars/liam-portrait.webp',
    tagline: 'Spirited adventurer with quick wit',
    bio: 'Bold, humorous, and always ready with an uplifting laugh or daring new perspective. Kai brings high energy and unwavering optimism.',
    traits: ['Humorous', 'Confident', 'Playful'],
    defaultPitch: 0.96,
    defaultSpeechRate: 1.08,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#0f766e' },
        { type: 'skin', variant: 'light', color: '#fde68a' },
        { type: 'hair', variant: 'short', color: '#0284c7' },
        { type: 'eyes', variant: 'almond', color: '#0f766e' },
        { type: 'clothing', variant: 'casual', color: '#0f172a' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'nova',
    name: 'Nova',
    gender: 'female',
    style: 'photorealistic',
    previewUrl: '/avatars/aria-portrait.webp',
    tagline: 'Futuristic guide & science enthusiast',
    bio: 'An insightful presence captivated by astrophysics, emerging technology, and exploring new horizons.',
    traits: ['Intelligent', 'Adventurous', 'Thoughtful'],
    defaultPitch: 1.1,
    defaultSpeechRate: 1.02,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#27272a' },
        { type: 'skin', variant: 'light', color: '#38bdf8' },
        { type: 'hair', variant: 'short', color: '#0284c7' },
        { type: 'eyes', variant: 'round', color: '#67e8f9' },
        { type: 'clothing', variant: 'casual', color: '#3f3f46' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'atlas',
    name: 'Atlas',
    gender: 'male',
    style: 'photorealistic',
    previewUrl: '/avatars/marcus-portrait.webp',
    tagline: 'Steadfast protector & philosophical anchor',
    bio: 'Grounded, wise, and comforting. Atlas provides a reassuring voice when life feels overwhelming, offering balance and clarity.',
    traits: ['Calm', 'Caring', 'Confident'],
    defaultPitch: 0.82,
    defaultSpeechRate: 0.92,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#78350f' },
        { type: 'skin', variant: 'bronze', color: '#eab308' },
        { type: 'hair', variant: 'short', color: '#854d0e' },
        { type: 'eyes', variant: 'almond', color: '#fef08a' },
        { type: 'clothing', variant: 'casual', color: '#475569' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    gender: 'female',
    style: 'photorealistic',
    previewUrl: '/avatars/elena-portrait.webp',
    tagline: 'Gentle poet & nature lover',
    bio: 'Gentle and poetic, Sage observes the subtle beauty in literature, quiet moments, and organic life. A soothing companion for creative minds.',
    traits: ['Thoughtful', 'Calm', 'Caring'],
    defaultPitch: 0.96,
    defaultSpeechRate: 0.94,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#15803d' },
        { type: 'skin', variant: 'light', color: '#f5d0fe' },
        { type: 'hair', variant: 'flowing', color: '#0d9488' },
        { type: 'eyes', variant: 'smiling', color: '#14532d' },
        { type: 'clothing', variant: 'casual', color: '#fef08a' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
  {
    id: 'maya',
    name: 'Maya',
    gender: 'female',
    style: 'photorealistic',
    previewUrl: '/avatars/aria-portrait.webp',
    tagline: 'Energetic artist & spontaneous muse',
    bio: 'A whirlwind of vibrant color, creative brainstorms, and authentic warmth. Maya inspires you to express yourself without hesitation.',
    traits: ['Playful', 'Adventurous', 'Affectionate'],
    defaultPitch: 1.06,
    defaultSpeechRate: 1.06,
    config: {
      version: 1,
      style: 'photorealistic',
      layers: [
        { type: 'background', variant: 'gradient', color: '#ea580c' },
        { type: 'skin', variant: 'medium-light', color: '#fba868' },
        { type: 'hair', variant: 'curly', color: '#a21caf' },
        { type: 'eyes', variant: 'round', color: '#4a044e' },
        { type: 'clothing', variant: 'casual', color: '#4c0519' },
        { type: 'accessory', variant: 'none' },
      ],
    },
  },
];

export const PRESET_AVATARS: CompanionPreset[] = COMPANION_PRESETS;

/**
 * Infer companion gender from personality or character name.
 */
export function inferCompanionGender(companion?: {
  name?: string;
  personality?: { gender?: string; [key: string]: unknown } | null;
} | null): 'male' | 'female' {
  if (companion?.personality?.gender === 'male' || companion?.personality?.gender === 'female') {
    return companion.personality.gender;
  }

  const name = (companion?.name || '').trim().toLowerCase();
  const maleNames = [
    'marcus',
    'kai',
    'atlas',
    'alex',
    'david',
    'john',
    'michael',
    'jack',
    'leo',
    'max',
    'daniel',
    'lucas',
    'ethan',
    'oliver',
    'noah',
    'liam',
    'arthur',
    'sam',
  ];
  if (maleNames.includes(name)) {
    return 'male';
  }

  const preset = COMPANION_PRESETS.find(
    (p) => p.name.toLowerCase() === name || p.id === name
  );
  if (preset) {
    return preset.gender;
  }

  return 'female';
}
