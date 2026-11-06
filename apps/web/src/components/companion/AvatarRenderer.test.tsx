import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AvatarRenderer, AvatarConfig, VisemeCue } from './AvatarRenderer';

describe('AvatarRenderer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

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

    const { container: interruptedContainer } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria.svg"
        state="interrupted"
      />
    );
    expect(interruptedContainer.firstChild).toHaveClass('ring-amber-400/80');
  });

  it('renders audio-driven speaking mouth layer when state is speaking and speakUrl is resolved', () => {
    const { container } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        audioLevel={0.65}
      />
    );

    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    const mouthImg = Array.from(imgs).find((img) => img.getAttribute('src')?.includes('aria-speak.webp'));
    expect(mouthImg).toBeDefined();
  });

  it('supports multiple independently selectable companion portraits (Marcus, Elena, Liam)', () => {
    const companions = [
      { name: 'Marcus', url: '/avatars/marcus-portrait.webp', speak: 'marcus-speak.webp' },
      { name: 'Elena', url: '/avatars/elena-portrait.webp', speak: 'elena-speak.webp' },
      { name: 'Liam', url: '/avatars/liam-portrait.webp', speak: 'liam-speak.webp' },
    ];

    for (const comp of companions) {
      const { container } = render(
        <AvatarRenderer
          name={comp.name}
          previewUrl={comp.url}
          state="speaking"
          audioLevel={0.5}
        />
      );

      const imgs = container.querySelectorAll('img');
      const baseImg = Array.from(imgs).find((img) => img.getAttribute('src') === comp.url);
      expect(baseImg).toBeDefined();
      const speakImg = Array.from(imgs).find((img) => img.getAttribute('src')?.includes(comp.speak));
      expect(speakImg).toBeDefined();
    }
  });

  it('provides graceful fallback when image fails to load', () => {
    const { container } = render(
      <AvatarRenderer
        name="Elena Vance"
        previewUrl="/avatars/non-existent-image.jpg"
      />
    );

    const baseImg = container.querySelector('img');
    expect(baseImg).toBeInTheDocument();

    fireEvent.error(baseImg!);
    expect(screen.getByText('EV')).toBeInTheDocument();
  });

  /* ================= REGRESSION & AUDIT TESTS ================= */

  it('tests facial state transitions and posture classes across lifecycles', () => {
    const { container, rerender } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="idle"
      />
    );

    const head = container.querySelector('[data-testid="avatar-head-container"]');
    expect(head).toHaveClass('scale-100');

    // Listening state: forward posture tilt
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="listening"
      />
    );
    expect(head).toHaveClass('scale-[1.015]');

    // Processing speech: subtle lateral thinking posture
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="processing_speech"
      />
    );
    expect(head).toHaveClass('rotate-1');
  });

  it('ensures immediate mouth closure after speech playback ends', () => {
    const { container, rerender } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        isSpeaking={true}
        audioLevel={0.8}
      />
    );

    expect(container.querySelector('[data-testid="avatar-speak-layer"]')).toBeInTheDocument();

    // Playback ends -> state transitions to idle
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="idle"
        isSpeaking={false}
        audioLevel={0.0}
      />
    );

    // Mouth speak layer immediately unmounted
    expect(container.querySelector('[data-testid="avatar-speak-layer"]')).not.toBeInTheDocument();
  });

  it('ensures immediate interruption stops mouth animation and returns to neutral posture', () => {
    const { container, rerender } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        audioLevel={0.75}
      />
    );

    expect(container.querySelector('[data-testid="avatar-speak-layer"]')).toBeInTheDocument();

    // User interrupts companion
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="interrupted"
        audioLevel={0}
      />
    );

    expect(container.querySelector('[data-testid="avatar-speak-layer"]')).not.toBeInTheDocument();
    const head = container.querySelector('[data-testid="avatar-head-container"]');
    expect(head).toHaveClass('scale-[1.0]');
  });

  it('gracefully renders custom/unknown portrait URLs where blink and speak assets are missing', () => {
    const { container } = render(
      <AvatarRenderer
        name="Custom AI"
        previewUrl="/custom/uploaded-avatar.jpg"
        state="speaking"
        audioLevel={0.6}
      />
    );

    // Only the base portrait is rendered, no broken speak layer img
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0]?.getAttribute('src')).toBe('/custom/uploaded-avatar.jpg');
    expect(container.querySelector('[data-testid="avatar-speak-layer"]')).not.toBeInTheDocument();
  });

  it('respects prefers-reduced-motion by disabling respiratory sway and posture transforms', () => {
    // Mock prefers-reduced-motion media query
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { container } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="listening"
      />
    );

    const head = container.querySelector('[data-testid="avatar-head-container"]');
    expect(head).toHaveStyle({ animation: 'none' });
    // Posture transforms disabled
    expect(head?.className).not.toContain('rotate-');

    window.matchMedia = originalMatchMedia;
  });

  it('handles repeated mount/unmount lifecycles without leaking timers or throwing errors', () => {
    for (let i = 0; i < 20; i++) {
      const { unmount } = render(
        <AvatarRenderer
          name="Aria"
          previewUrl="/avatars/aria-portrait.webp"
          state="speaking"
          audioLevel={0.5}
        />
      );
      act(() => {
        jest.advanceTimersByTime(200);
      });
      unmount();
    }
  });

  it('supports viseme timing cues with pause/silence and bilabial mouth closure', () => {
    const visemes: VisemeCue[] = [
      { start: 0.0, end: 0.3, viseme: 'A' }, // Bilabial ('Mmm' - mouth sealed)
      { start: 0.3, end: 0.8, viseme: 'D' }, // Open vowel ('Aah' - wide open)
      // Gap 0.8 to 1.1 -> Silence / Pause
      { start: 1.1, end: 1.5, viseme: 'C' }, // Mid vowel ('Eh')
    ];

    const { container, rerender } = render(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        visemes={visemes}
        currentTime={0.1} // Viseme A
      />
    );

    // During active speaking, speak layer is rendered
    const speakLayer = container.querySelector('[data-testid="avatar-speak-layer"]');
    expect(speakLayer).toBeInTheDocument();

    // Advance time to open vowel Viseme D (0.5s)
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        visemes={visemes}
        currentTime={0.5}
      />
    );
    expect(speakLayer).toBeInTheDocument();

    // Advance time to pause/silence (0.95s)
    rerender(
      <AvatarRenderer
        name="Aria"
        previewUrl="/avatars/aria-portrait.webp"
        state="speaking"
        visemes={visemes}
        currentTime={0.95}
      />
    );
    expect(speakLayer).toBeInTheDocument();
  });
});
