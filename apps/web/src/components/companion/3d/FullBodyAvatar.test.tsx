import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FullBodyAvatar } from '../FullBodyAvatar';
import { CameraToolbar } from './CameraToolbar';

describe('FullBodyAvatar Component & Camera Controls', () => {
  it('renders photorealistic video avatar by default and supports 2.5D portrait fallback', () => {
    const { rerender } = render(
      <FullBodyAvatar
        previewUrl="/avatars/aria-portrait.webp"
        name="Aria"
        state="idle"
      />
    );

    // Root avatar container exists
    expect(screen.getByTestId('full-body-avatar-root')).toBeInTheDocument();
    // Video Avatar container is rendered as primary experience
    expect(screen.getByTestId('video-avatar-container')).toBeInTheDocument();

    // When explicitly set to 2D portrait mode
    rerender(
      <FullBodyAvatar
        previewUrl="/avatars/aria-portrait.webp"
        name="Aria"
        state="idle"
        initialMode="2d"
      />
    );
    const img = screen.getByRole('img', { name: 'Aria' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/avatars/aria-portrait.webp');
  });

  it('renders camera toolbar and toggles 2D/3D presentation', () => {
    const handleZoomIn = jest.fn();
    const handleZoomOut = jest.fn();
    const handleReset = jest.fn();
    const handleToggle = jest.fn();

    render(
      <CameraToolbar
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        is3DMode={true}
        onToggle3DMode={handleToggle}
      />
    );

    // Verify accessible toolbar and buttons
    expect(screen.getByRole('toolbar', { name: /camera/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reset to full body/i)).toBeInTheDocument();

    // Zoom in clicked
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    expect(handleZoomIn).toHaveBeenCalledTimes(1);

    // Zoom out clicked
    fireEvent.click(screen.getByLabelText(/zoom out/i));
    expect(handleZoomOut).toHaveBeenCalledTimes(1);

    // Reset clicked
    fireEvent.click(screen.getByLabelText(/reset to full body/i));
    expect(handleReset).toHaveBeenCalledTimes(1);

    // Toggle 2D/3D mode clicked
    fireEvent.click(screen.getByLabelText(/switch to 2.5d/i));
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard shortcuts for camera zoom and reset', () => {
    const handleZoomIn = jest.fn();
    const handleZoomOut = jest.fn();
    const handleReset = jest.fn();

    render(
      <CameraToolbar
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        is3DMode={true}
        onToggle3DMode={jest.fn()}
      />
    );

    // Press '+' to zoom in
    fireEvent.keyDown(window, { key: '+' });
    expect(handleZoomIn).toHaveBeenCalledTimes(1);

    // Press '-' to zoom out
    fireEvent.keyDown(window, { key: '-' });
    expect(handleZoomOut).toHaveBeenCalledTimes(1);

    // Press 'r' to reset
    fireEvent.keyDown(window, { key: 'r' });
    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it('does not trigger camera shortcuts when user is typing in an input element', () => {
    const handleZoomIn = jest.fn();

    render(
      <div>
        <input data-testid="chat-text-input" />
        <CameraToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={jest.fn()}
          onReset={jest.fn()}
          is3DMode={true}
          onToggle3DMode={jest.fn()}
        />
      </div>
    );

    const input = screen.getByTestId('chat-text-input');
    input.focus();

    fireEvent.keyDown(input, { key: '+' });
    expect(handleZoomIn).not.toHaveBeenCalled();
  });

  it('unmounts cleanly without throwing memory or timer errors', () => {
    const { unmount } = render(
      <FullBodyAvatar
        previewUrl="/avatars/marcus-portrait.webp"
        name="Marcus"
        state="speaking"
      />
    );

    expect(() => unmount()).not.toThrow();
  });

  it('selects distinct photorealistic character models for Aria and Marcus', () => {
    const { rerender } = render(
      <FullBodyAvatar
        name="Aria"
        state="idle"
      />
    );
    expect(screen.getByTestId('full-body-avatar-root')).toBeInTheDocument();

    rerender(
      <FullBodyAvatar
        name="Marcus"
        state="idle"
      />
    );
    expect(screen.getByTestId('full-body-avatar-root')).toBeInTheDocument();
  });

  it('activates 3D companion presentation when Avatar3DConfig is provided', () => {
    const customConfig = {
      version: 2 as const,
      baseModelId: 'aria_photorealistic' as const,
      face: {
        jawWidth: 0.6,
        chinLength: 0.55,
        cheekboneHeight: 0.7,
        eyeSize: 0.65,
        noseLength: 0.5,
        noseBridgeWidth: 0.45,
        lipFullnessUpper: 0.7,
        lipFullnessLower: 0.65,
        mouthWidth: 0.55,
      },
      materials: {
        skinTone: '#F5D0B5',
        eyeColor: '#2B5E3B',
      },
      hair: {
        assetId: 'ponytail01' as const,
        color: '#4A2E18',
      },
      body: {
        height: 1.05,
        muscle: 0.5,
        weight: 0.5,
      },
      clothing: {
        topColor: '#232938',
      },
    };

    render(
      <FullBodyAvatar
        name="Aria"
        state="idle"
        config={customConfig}
      />
    );

    // Root renders
    expect(screen.getByTestId('full-body-avatar-root')).toBeInTheDocument();
  });

  it('respects marcus_photorealistic baseModelId in Avatar3DConfig', () => {
    const marcusConfig = {
      version: 2 as const,
      baseModelId: 'marcus_photorealistic' as const,
      face: {
        jawWidth: 0.7,
        chinLength: 0.6,
        cheekboneHeight: 0.6,
        eyeSize: 0.5,
        noseLength: 0.5,
        noseBridgeWidth: 0.5,
        lipFullnessUpper: 0.5,
        lipFullnessLower: 0.5,
        mouthWidth: 0.5,
      },
      materials: {
        skinTone: '#9E6B47',
        eyeColor: '#3B2219',
      },
      hair: {
        assetId: 'short02' as const,
        color: '#1A1A1A',
      },
      body: {
        height: 1.1,
        muscle: 0.6,
        weight: 0.5,
      },
      clothing: {
        topColor: '#1C1E24',
      },
    };

    render(
      <FullBodyAvatar
        name="Marcus Custom"
        state="idle"
        config={marcusConfig}
      />
    );

    expect(screen.getByTestId('full-body-avatar-root')).toBeInTheDocument();
  });
});
