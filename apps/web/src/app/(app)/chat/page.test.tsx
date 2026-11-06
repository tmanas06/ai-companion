import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatPage from './page';

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

describe('Voice-First Live Companion Page', () => {
  const mockCompanions = [
    {
      id: 'comp-1',
      name: 'Maya',
      system_prompt: 'Helpful companion',
      personality: {
        style: 'anime',
        traits: ['Warm', 'Empathetic'],
        bio: 'A compassionate companion.',
      },
      llm_config: { provider: 'ollama' },
    },
    {
      id: 'comp-2',
      name: 'Marcus',
      system_prompt: 'Wise philosopher',
      personality: {
        style: 'photorealistic',
        traits: ['Thoughtful'],
      },
      llm_config: { provider: 'ollama' },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversations: [
              {
                id: 'conv-1',
                title: 'Live Session with Maya',
                companion_id: 'comp-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }
      if (url === '/api/voice/turn') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            turn_id: 'turn-1',
            conversation_id: 'conv-1',
            user_transcript: 'Hello Maya, how are you today?',
            response_text: "I am feeling wonderful today! It is great to hear your voice.",
            audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            audio_format: 'wav',
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL in mock: ${url}`));
    });
  });

  it('renders the dedicated live companion experience without text chat bubbles or composer', async () => {
    render(<ChatPage />);

    // Companion name and personality badges should display
    expect(await screen.findByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('anime')).toBeInTheDocument();
    expect(screen.getByText(/• Warm/i)).toBeInTheDocument();

    // Default status should be Ready to talk
    expect(screen.getAllByText('Ready to talk').length).toBeGreaterThan(0);

    // Primary Microphone button should be present
    const micButton = screen.getByTitle('Tap or hold to speak');
    expect(micButton).toBeInTheDocument();

    // Instructions should mention voice/spacebar
    expect(screen.getByText(/Tap the microphone or hold/i)).toBeInTheDocument();

    // Crucial requirement: NO text message composer, send button, or chat timeline
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();

    // Action buttons
    expect(screen.getByTitle('Voice & Audio Settings')).toBeInTheDocument();
    expect(screen.getByTitle('Customize Appearance & Personality')).toBeInTheDocument();
    expect(screen.getByTitle('Companion Memory Vault')).toBeInTheDocument();
    expect(screen.getByTitle('Exit to Companions Hub')).toBeInTheDocument();
  });

  it('allows switching between companions in the live session', async () => {
    render(<ChatPage />);

    const companionTitleBtn = await screen.findByRole('button', { name: /maya/i });
    fireEvent.click(companionTitleBtn);

    // Dropdown options
    expect(screen.getByText('Switch Companion')).toBeInTheDocument();
    const marcusBtn = screen.getByRole('button', { name: /marcus/i });
    expect(marcusBtn).toBeInTheDocument();

    fireEvent.click(marcusBtn);

    // Header updates to Marcus
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('photorealistic')).toBeInTheDocument();
  });

  it('transitions state through listening and generates response on mic interaction', async () => {
    render(<ChatPage />);

    // Ensure companion is loaded
    await screen.findByText('Maya');

    const micButton = screen.getByTitle('Tap or hold to speak');

    // Click microphone to start listening
    await act(async () => {
      fireEvent.click(micButton);
    });

    // In listening state:
    await waitFor(() => {
      expect(screen.getAllByText('Listening...').length).toBeGreaterThan(0);
    });

    // Click again to finish speaking
    const stopButton = screen.getByTitle('Tap or release to finish speaking');
    await act(async () => {
      fireEvent.click(stopButton);
    });

    // Turns into speaking state and displays response subtitle
    await waitFor(() => {
      expect(screen.getAllByText('Speaking...').length).toBeGreaterThan(0);
      expect(screen.getByText(/I am feeling wonderful today!/i)).toBeInTheDocument();
    });

    // Interrupt button should be available during speech
    const interruptBtn = screen.getByTitle('Interrupt speech');
    expect(interruptBtn).toBeInTheDocument();
  });

  it('handles user interruption cleanly during speech', async () => {
    render(<ChatPage />);

    // Ensure companion is loaded
    await screen.findByText('Maya');

    const micButton = screen.getByTitle('Tap or hold to speak');

    // Start and stop listening to trigger speech turn
    await act(async () => {
      fireEvent.click(micButton);
    });
    await waitFor(() => {
      expect(screen.getAllByText('Listening...').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Tap or release to finish speaking'));
    });

    // Wait until speaking
    const interruptBtn = await screen.findByTitle('Interrupt speech');
    expect(interruptBtn).toBeInTheDocument();

    // Click Interrupt
    await act(async () => {
      fireEvent.click(interruptBtn);
    });

    // Companion audio is paused and status returns to Interrupted / Ready
    await waitFor(() => {
      expect(screen.queryByTitle('Interrupt speech')).not.toBeInTheDocument();
    });
  });

  it('handles microphone permission denial gracefully with clear error state', async () => {
    // Mock getUserMedia rejecting with NotAllowedError
    const permErr = new Error('Microphone permission was denied.');
    permErr.name = 'NotAllowedError';
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(permErr);

    render(<ChatPage />);

    await screen.findByText('Maya');

    const micButton = screen.getByTitle('Tap or hold to speak');

    await act(async () => {
      fireEvent.click(micButton);
    });

    // Error banner should appear
    await waitFor(() => {
      expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
      expect(screen.getByText(/Microphone permission was denied/i)).toBeInTheDocument();
    });
  });

  it('opens and closes voice & audio settings modal', async () => {
    render(<ChatPage />);

    await screen.findByText('Maya');

    const settingsBtn = screen.getByTitle('Voice & Audio Settings');
    fireEvent.click(settingsBtn);

    // Modal contents
    expect(await screen.findByText('Voice & Audio Settings')).toBeInTheDocument();
    expect(screen.getByText(/Speech Output Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Speech Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/Voice Pitch/i)).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole('button', { name: /save & close/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Speech Output Engine/i)).not.toBeInTheDocument();
    });
  });
});
