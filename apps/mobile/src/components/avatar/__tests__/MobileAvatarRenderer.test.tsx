import React from 'react';
import { render } from '@testing-library/react-native';
import { MobileAvatarRenderer } from '../MobileAvatarRenderer';
import { DEFAULT_AVATAR_3D_CONFIG } from '@ai-companion/shared';

describe('MobileAvatarRenderer', () => {
  it('renders 2D fallback directly when force2D is true', () => {
    const { getByTestId, getByText } = render(
      <MobileAvatarRenderer
        config={DEFAULT_AVATAR_3D_CONFIG}
        force2D={true}
      />
    );

    expect(getByTestId('avatar-2d-fallback')).toBeTruthy();
    expect(getByText('2D Companion Mode (2D Mode Selected)')).toBeTruthy();
  });

  it('renders loading overlay while waiting for 3D context', () => {
    const { getByText } = render(
      <MobileAvatarRenderer config={DEFAULT_AVATAR_3D_CONFIG} />
    );

    expect(getByText(/Loading Aria 3D Avatar.../i)).toBeTruthy();
  });

  it('renders Marcus loading text when baseModelId is marcus_photorealistic', () => {
    const marcusConfig = {
      ...DEFAULT_AVATAR_3D_CONFIG,
      baseModelId: 'marcus_photorealistic' as const,
    };

    const { getByText } = render(
      <MobileAvatarRenderer config={marcusConfig} />
    );

    expect(getByText(/Loading Marcus 3D Avatar.../i)).toBeTruthy();
  });

  it('displays error notice and retry button on recoverable error', () => {
    const onError = jest.fn();
    const { getByTestId } = render(
      <MobileAvatarRenderer
        config={DEFAULT_AVATAR_3D_CONFIG}
        force2D={true}
        onError={onError}
      />
    );

    expect(getByTestId('avatar-2d-fallback')).toBeTruthy();
  });
});
