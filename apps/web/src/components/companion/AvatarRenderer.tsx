'use client';

import React from 'react';

export interface AvatarLayerConfig {
  type: 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  zIndex?: number;
  visible?: boolean;
}

export type AvatarLayer = AvatarLayerConfig;

export interface AvatarConfig {
  version: number;
  style?: 'photorealistic' | 'anime' | '3d' | 'illustrated';
  layers: AvatarLayerConfig[];
}

interface AvatarRendererProps {
  config?: AvatarConfig;
  previewUrl?: string | null;
  name?: string;
  className?: string;
  size?: number | string;
}

export const AvatarRenderer: React.FC<AvatarRendererProps> = ({
  config,
  previewUrl,
  name = 'Companion',
  className = '',
  size = 280,
}) => {
  // If a pre-rendered static preview URL is provided (e.g. /avatars/luna-anime.svg) and no custom layer overrides
  if (previewUrl && (!config || !config.layers || config.layers.length === 0)) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl shadow-xl flex items-center justify-center bg-slate-900 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Extract layers from config
  const layers = config?.layers || [];
  const getLayer = (type: string) => layers.find((l) => l.type === type && l.visible !== false);

  const bgLayer = getLayer('background');
  const skinLayer = getLayer('skin');
  const hairLayer = getLayer('hair');
  const eyesLayer = getLayer('eyes');
  const clothLayer = getLayer('clothing');
  const accLayer = getLayer('accessory');

  // Default colors
  const skinColor = skinLayer?.color || (skinLayer?.variant === 'dark' ? '#8D5524' : skinLayer?.variant === 'bronze' ? '#C68642' : '#fed7aa');
  const hairColor = hairLayer?.color || (hairLayer?.variant === 'flowing' ? '#818cf8' : hairLayer?.variant === 'anime-spikes' ? '#38bdf8' : '#334155');
  const eyeColor = eyesLayer?.color || '#2563eb';
  const clothColor = clothLayer?.color || '#1e293b';
  const bgColor = bgLayer?.color || '#4f46e5';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl shadow-2xl flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 300 300"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full select-none"
      >
        <defs>
          <linearGradient id={`grad-bg-${name}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={bgColor} />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <radialGradient id={`glow-${name}`} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="100%" stopColor={bgColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Background Layer */}
        <rect width="300" height="300" fill={`url(#grad-bg-${name})`} />
        <circle cx="150" cy="130" r="110" fill={`url(#glow-${name})`} />

        {/* 2. Back Hair */}
        {(hairLayer?.variant === 'flowing' || hairLayer?.variant === 'ponytail') && (
          <path
            d="M80 120 C50 180 50 250 80 280 C95 240 90 170 100 130 Z M220 120 C250 180 250 250 220 280 C205 240 210 170 200 130 Z"
            fill={hairColor}
          />
        )}

        {/* 3. Clothing & Torso */}
        <path
          d="M75 270 C95 230 125 218 150 218 C175 218 205 230 225 270 L225 300 L75 300 Z"
          fill={clothColor}
        />
        {clothLayer?.variant === 'blazer' && (
          <path d="M125 218 L150 260 L175 218" fill="none" stroke="#f8fafc" strokeWidth="2.5" />
        )}
        {clothLayer?.variant === 'futuristic' && (
          <polygon points="150,225 165,250 135,250" fill="#38bdf8" />
        )}

        {/* 4. Neck */}
        <path d="M136 185 L136 222 C145 225 155 225 164 222 L164 185 Z" fill={skinColor} filter="brightness(0.92)" />

        {/* 5. Head / Skin */}
        <ellipse cx="150" cy="142" rx="52" ry="60" fill={skinColor} />
        {/* Ears */}
        <ellipse cx="98" cy="144" rx="6" ry="11" fill={skinColor} filter="brightness(0.92)" />
        <ellipse cx="202" cy="144" rx="6" ry="11" fill={skinColor} filter="brightness(0.92)" />

        {/* 6. Eyes */}
        {eyesLayer?.variant === 'smiling' ? (
          <>
            <path d="M122 140 Q131 133 140 140" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
            <path d="M160 140 Q169 133 178 140" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="130" cy="140" rx="9" ry="6" fill="#ffffff" />
            <circle cx="131" cy="140" r="4.2" fill={eyeColor} />
            <circle cx="132" cy="138" r="1.5" fill="#ffffff" />

            <ellipse cx="170" cy="140" rx="9" ry="6" fill="#ffffff" />
            <circle cx="169" cy="140" r="4.2" fill={eyeColor} />
            <circle cx="170" cy="138" r="1.5" fill="#ffffff" />
          </>
        )}

        {/* Eyebrows */}
        <path d="M120 128 Q130 124 140 128" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M160 128 Q170 124 180 128" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />

        {/* Nose */}
        <path d="M149 146 L147 156 L153 156" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />

        {/* Mouth */}
        <path d="M138 171 Q150 180 162 171" fill="none" stroke="#be123c" strokeWidth="2.5" strokeLinecap="round" />

        {/* 7. Hair (Front) */}
        {hairLayer?.variant === 'anime-spikes' ? (
          <polygon
            points="90,130 98,90 115,110 130,70 148,95 155,55 170,90 188,68 200,105 212,125 198,110 178,118 160,100 145,115 125,98 110,120"
            fill={hairColor}
          />
        ) : hairLayer?.variant === 'curly' ? (
          <path
            d="M92 130 C85 80 120 65 150 65 C180 65 215 80 208 130 C198 105 180 95 150 95 C120 95 102 105 92 130 Z"
            fill={hairColor}
          />
        ) : hairLayer?.variant === 'short' ? (
          <path
            d="M96 125 C95 85 125 72 150 72 C175 72 205 85 204 125 C190 98 175 90 150 90 C125 90 110 98 96 125 Z"
            fill={hairColor}
          />
        ) : (
          <path
            d="M94 130 C90 80 125 70 150 70 C175 70 210 80 206 130 C195 105 180 95 150 95 C120 95 105 105 94 130 Z M95 125 C108 140 115 160 112 175 C108 160 102 145 95 125 Z M205 125 C192 140 185 160 188 175 C192 160 198 145 205 125 Z"
            fill={hairColor}
          />
        )}

        {/* 8. Accessories */}
        {accLayer?.variant === 'glasses' && (
          <g stroke={accLayer.color || '#facc15'} strokeWidth="2.5" fill="none">
            <rect x="116" y="132" width="28" height="18" rx="4" />
            <rect x="156" y="132" width="28" height="18" rx="4" />
            <line x1="144" y1="141" x2="156" y2="141" />
          </g>
        )}
        {accLayer?.variant === 'earrings' && (
          <g fill={accLayer.color || '#facc15'}>
            <circle cx="98" cy="155" r="3.5" />
            <circle cx="202" cy="155" r="3.5" />
          </g>
        )}
        {accLayer?.variant === 'headphones' && (
          <g stroke={accLayer.color || '#06b6d4'} strokeWidth="4" fill="none">
            <path d="M96 145 C94 90 206 90 204 145" />
            <rect x="90" y="135" width="10" height="20" rx="4" fill={accLayer.color || '#06b6d4'} stroke="none" />
            <rect x="200" y="135" width="10" height="20" rx="4" fill={accLayer.color || '#06b6d4'} stroke="none" />
          </g>
        )}
      </svg>
    </div>
  );
};
