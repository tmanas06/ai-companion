import React from 'react';
import { render } from '@testing-library/react-native';
import { Avatar2DFallback } from '../Avatar2DFallback';
import { DEFAULT_AVATAR_3D_CONFIG } from '@ai-companion/shared';

describe('Avatar2DFallback', () => {
  it('renders default fallback successfully with idle state', () => {
    const { getByTestId, getByText } = render(
      <Avatar2DFallback config={DEFAULT_AVATAR_3D_CONFIG} />
    );

    expect(getByTestId('avatar-2d-fallback')).toBeTruthy();
    expect(getByText('Idle')).toBeTruthy();
  });

  it('displays fallback reason notice when reason is provided', () => {
    const { getByText } = render(
      <Avatar2DFallback
        config={DEFAULT_AVATAR_3D_CONFIG}
        reason="WebGL Context Lost"
      />
    );

    expect(getByText('2D Companion Mode (WebGL Context Lost)')).toBeTruthy();
  });

  it('displays speaking status badge when isSpeaking is true', () => {
    const { getByText } = render(
      <Avatar2DFallback
        config={DEFAULT_AVATAR_3D_CONFIG}
        isSpeaking={true}
        audioLevel={0.7}
      />
    );

    expect(getByText('Speaking...')).toBeTruthy();
  });

  it('displays listening status badge when isListening is true', () => {
    const { getByText } = render(
      <Avatar2DFallback
        config={DEFAULT_AVATAR_3D_CONFIG}
        isListening={true}
      />
    );

    expect(getByText('Listening...')).toBeTruthy();
  });

  it('renders male configuration for Marcus baseModelId', () => {
    const marcusConfig = {
      ...DEFAULT_AVATAR_3D_CONFIG,
      baseModelId: 'marcus_photorealistic' as const,
      materials: {
        ...DEFAULT_AVATAR_3D_CONFIG.materials,
        skinTone: '#6E4123',
        eyeColor: '#2B5E3B',
      },
      clothing: {
        ...DEFAULT_AVATAR_3D_CONFIG.clothing,
        topColor: '#1B3B2B',
      },
    };

    const { getByTestId } = render(
      <Avatar2DFallback config={marcusConfig} />
    );
    expect(getByTestId('avatar-2d-fallback')).toBeTruthy();
  });
});
