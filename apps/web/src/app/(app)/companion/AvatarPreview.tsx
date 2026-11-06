'use client';

import React from 'react';
import { AvatarRenderer } from '@/components/companion/AvatarRenderer';

interface AvatarLayer {
  type: 'background' | 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  z_index?: number;
  visible?: boolean;
}

interface AvatarConfig {
  version: number;
  style?: 'photorealistic' | 'anime' | '3d' | 'illustrated';
  layers?: AvatarLayer[];
}

interface Asset {
  id: string;
  layer_type: string;
  variant: string;
  asset_url: string;
  metadata: Record<string, unknown>;
}

interface AvatarPreviewProps {
  config: AvatarConfig;
  _assets?: Record<string, Asset[]>;
  size?: number;
  previewUrl?: string;
  name?: string;
}

export function AvatarPreview({
  config,
  _assets,
  size = 200,
  previewUrl,
  name = 'Companion',
}: AvatarPreviewProps) {
  // If previewUrl is not provided, default to the photorealistic companion portrait
  const resolvedUrl = previewUrl || '/avatars/aria-portrait.webp';

  return (
    <div className="relative w-full aspect-square flex items-center justify-center" style={{ width: size, height: size }}>
      <AvatarRenderer
        config={config}
        previewUrl={resolvedUrl}
        name={name}
        size={size}
        state="idle"
      />
    </div>
  );
}