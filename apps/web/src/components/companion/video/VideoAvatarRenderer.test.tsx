import React from 'react';
import { render, screen } from '@testing-library/react';
import { VideoAvatarRenderer } from './VideoAvatarRenderer';

// Mock HTMLMediaElement.prototype.play and pause
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn().mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = jest.fn();
});

describe('VideoAvatarRenderer Component', () => {
  it('renders dual video elements and container', () => {
    render(<VideoAvatarRenderer state="idle" currentEmotion="neutral" />);

    const container = screen.getByTestId('video-avatar-container');
    expect(container).toBeInTheDocument();

    const videoElements = container.querySelectorAll('video');
    expect(videoElements.length).toBe(2);
  });

  it('updates state indicator when state changes to listening', () => {
    const { rerender } = render(<VideoAvatarRenderer state="idle" />);
    expect(screen.getByText(/idle/i)).toBeInTheDocument();

    rerender(<VideoAvatarRenderer state="listening" />);
    expect(screen.getByText(/listening/i)).toBeInTheDocument();
  });

  it('displays emotion pill when emotion is active', () => {
    render(<VideoAvatarRenderer state="speaking" currentEmotion="happy" isSpeaking={true} />);

    expect(screen.getByText(/happy/i)).toBeInTheDocument();
  });

  it('invokes onStateTransition callback on state change', () => {
    const onStateTransition = jest.fn();
    const { rerender } = render(
      <VideoAvatarRenderer state="idle" onStateTransition={onStateTransition} />
    );

    rerender(<VideoAvatarRenderer state="listening" onStateTransition={onStateTransition} />);
    expect(onStateTransition).toHaveBeenCalled();
  });

  it('cleans up resources and pauses video on unmount', () => {
    const pauseSpy = jest.spyOn(window.HTMLMediaElement.prototype, 'pause');
    const { unmount } = render(<VideoAvatarRenderer state="idle" />);

    unmount();
    expect(pauseSpy).toHaveBeenCalled();
  });
});
