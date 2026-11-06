import React from 'react';
import { render, screen } from '@testing-library/react';
import { AvatarRenderer, AvatarConfig } from './AvatarRenderer';

describe('AvatarRenderer', () => {
  it('renders high-res preview image when previewUrl is provided, even if config.layers is non-empty', () => {
    const configWithLayers: AvatarConfig = {
      version: 1,
      style: 'anime',
      layers: [
        { type: 'skin', variant: 'light', color: '#fed7aa' },
        { type: 'eyes', variant: 'friendly', color: '#2563eb' },
        { type: 'hair', variant: 'flowing', color: '#818cf8' },
      ],
    };

    render(
      <AvatarRenderer
        name="Luna"
        previewUrl="/avatars/luna.svg"
        config={configWithLayers}
      />
    );

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/avatars/luna.svg');
    expect(img).toHaveAttribute('alt', 'Luna');
  });

  it('renders vector SVG layers when previewUrl is null/undefined', () => {
    const configWithLayers: AvatarConfig = {
      version: 1,
      style: 'anime',
      layers: [
        { type: 'skin', variant: 'dark', color: '#8D5524' },
        { type: 'eyes', variant: 'sharp', color: '#10b981' },
      ],
    };

    const { container } = render(
      <AvatarRenderer
        name="Custom"
        previewUrl={null}
        config={configWithLayers}
      />
    );

    // No img element, renders SVG vector avatar instead
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies voice state aura styles according to companion state', () => {
    const { container: listeningContainer } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria.svg"
        state="listening"
      />
    );

    expect(listeningContainer.firstChild).toHaveClass('ring-emerald-400/80');

    const { container: speakingContainer } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria.svg"
        state="speaking"
      />
    );

    expect(speakingContainer.firstChild).toHaveClass('ring-violet-500/80');
  });
});
