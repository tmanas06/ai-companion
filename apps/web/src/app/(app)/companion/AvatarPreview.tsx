'use client';

interface AvatarPreviewProps {
  config: AvatarConfig;
  _assets: Record<string, Asset[]>;
  size?: number;
}

export function AvatarPreview({ config, _assets, size = 200 }: AvatarPreviewProps) {

  function renderLayers(): React.ReactElement[] {
    const elements: React.ReactElement[] = [];
    const layerTypes = ['background', 'skin', 'eyes', 'hair', 'clothing', 'accessory'] as const;
    
    for (const layerType of layerTypes) {
      const layer = config.layers?.find((l) => l.type === layerType);
      if (!layer || !layer.visible) continue;

      const element = (
        <g key={layerType}>
          {/* For now, draw simple shapes as placeholders */}
          {layerType === 'background' && (
            <rect x="0" y="0" width="200" height="200" fill="#e0f2fe" />
          )}
          {layerType === 'skin' && (
            <circle cx="100" cy="140" r="60" fill="#FFDBAC" />
          )}
          {layerType === 'eyes' && (
            <>
              <ellipse cx="75" cy="120" rx="15" ry="20" fill="white" />
              <ellipse cx="125" cy="120" rx="15" ry="20" fill="white" />
              <circle cx="75" cy="120" r="6" fill="#333" />
              <circle cx="125" cy="120" r="6" fill="#333" />
            </>
          )}
          {layerType === 'hair' && (
            <path d="M40 60 Q100 20 160 60 Q160 100 160 140 Q40 140 40 60 Z" fill="#3D2B1F" />
          )}
          {layerType === 'clothing' && (
            <path d="M40 140 Q100 200 160 140 L160 200 L40 200 Z" fill="#3B82F6" />
          )}
          {layerType === 'accessory' && (
            <g>
              <circle cx="75" cy="115" r="8" fill="none" stroke="#6B7280" strokeWidth="2" />
              <circle cx="125" cy="115" r="8" fill="none" stroke="#6B7280" strokeWidth="2" />
            </g>
          )}
        </g>
      );
      elements.push(element);
    }
    return elements;
  }

  return (
    <div className="relative w-full aspect-square" style={{ width: size, height: size }}>
      <svg className="w-full h-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
        {/* Background */}
        <rect width="200" height="200" fill="#f1f5f9" />
        {/* Layers rendered in order */}
        {renderLayers()}
        </svg>
      </div>
    );
  }

// Type definitions
interface AvatarConfig {
  version: number;
  layers: AvatarLayer[];
}

interface AvatarLayer {
  type: 'background' | 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  z_index: number;
  visible: boolean;
}

interface Asset {
  id: string;
  layer_type: string;
  variant: string;
  asset_url: string;
  metadata: Record<string, unknown>;
}