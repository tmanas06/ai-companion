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
      if (url === '/api/voice/greeting') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversation_id: 'conv-1',
            reply_text: 'Hi! It is wonderful to meet you. How can I brighten your day?',
            companion_id: 'comp-1',
            companion_name: 'Maya',
            audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            audio_format: 'wav',
          }),
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
      if (url === '/api/avatars/active') {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ detail: 'No active avatar found' }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL in mock: ${url}`));
    });
  });

  async function ensureReadyToTalk() {
    await screen.findByText('Maya');
    const interruptBtn = screen.queryByTitle('Interrupt speech');
    if (interruptBtn) {
      await act(async () => {
        fireEvent.click(interruptBtn);
      });
    }
    return await screen.findByTitle('Tap or hold to speak');
  }

  it('renders the dedicated live companion experience and causes avatar to speak first', async () => {
    render(<ChatPage />);

    // Companion name and personality badges should display
    expect(await screen.findByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('anime')).toBeInTheDocument();
    expect(screen.getByText(/• Warm/i)).toBeInTheDocument();

    // Proactive opening speech by avatar is displayed or in speaking state
    await waitFor(() => {
      const isSpeaking = screen.queryByText('Speaking...') !== null;
      const hasGreeting = screen.queryByText(/It is wonderful to meet you|brighten your day/i) !== null;
      expect(isSpeaking || hasGreeting).toBe(true);
    });

    // Crucial requirement: NO text message composer, send button, or chat timeline
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();

    // Action buttons
    expect(screen.getByTitle('Voice & Audio Settings')).toBeInTheDocument();
    expect(screen.getByTitle('Aria Avatar Studio (3D Character Customizer)')).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 1, name: /marcus/i })).toBeInTheDocument();
    expect(screen.getByText('photorealistic')).toBeInTheDocument();
  });

  it('transitions state through listening and generates response on mic interaction', async () => {
    render(<ChatPage />);

    // Ensure companion is loaded and ready
    const micButton = await ensureReadyToTalk();

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

    // Ensure companion is loaded and ready
    const micButton = await ensureReadyToTalk();

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

    const micButton = await ensureReadyToTalk();

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

  it('renders free-flow voice toggle and allows switching between continuous hands-free talking and push-to-talk', async () => {
    render(<ChatPage />);

    await screen.findByText('Maya');

    // Free-flow toggle button is rendered and defaults to ON
    const toggleBtn = await screen.findByRole('button', { name: /Free-Flow Voice: ON/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText('(Hands-Free)')).toBeInTheDocument();

    // Clicking toggle switches mode to OFF (Push-to-Talk)
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(await screen.findByRole('button', { name: /Free-Flow Voice: OFF/i })).toBeInTheDocument();
    expect(screen.getByText('(Push-to-Talk)')).toBeInTheDocument();
    expect(localStorage.getItem('ai_companion_hands_free_mode')).toBe('false');

    // Clicking again switches back to ON
    const offBtn = screen.getByRole('button', { name: /Free-Flow Voice: OFF/i });
    await act(async () => {
      fireEvent.click(offBtn);
    });

    expect(await screen.findByRole('button', { name: /Free-Flow Voice: ON/i })).toBeInTheDocument();
    expect(localStorage.getItem('ai_companion_hands_free_mode')).toBe('true');
  });

  it('automatically re-arms listening after companion finishes speaking in free-flow mode', async () => {
    render(<ChatPage />);

    await screen.findByText('Maya');

    // After companion's opening greeting audio finishes playing,
    // Free-Flow automatically transitions the companion to Listening without user clicking mic!
    await waitFor(
      () => {
        expect(screen.getAllByText('Listening...').length).toBeGreaterThan(0);
      },
      { timeout: 2000 }
    );
  });

  it('fetches and binds the authenticated user active 3D avatar configuration from /api/avatars/active', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/avatars/active') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'avatar-active-1',
            name: 'Aria Studio Custom',
            config_version: 2,
            config: {
              version: 2,
              baseModelId: 'aria_photorealistic',
              face: {
                jawWidth: 0.65,
                chinLength: 0.55,
                cheekboneHeight: 0.7,
                eyeSize: 0.6,
                noseLength: 0.5,
                noseBridgeWidth: 0.45,
                lipFullnessUpper: 0.6,
                lipFullnessLower: 0.6,
                mouthWidth: 0.55,
              },
              materials: {
                skinTone: '#F5D0B5',
                eyeColor: '#2B5E3B',
              },
              hair: {
                assetId: 'ponytail01',
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
            },
          }),
        });
      }
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: [] }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }
      if (url === '/api/voice/greeting') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversation_id: 'conv-1',
            reply_text: 'Hi there!',
            companion_id: 'comp-1',
            companion_name: 'Maya',
            audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            audio_format: 'wav',
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL in mock: ${url}`));
    });

    render(<ChatPage />);

    // Verify /api/avatars/active was called with no-store
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/avatars/active',
        expect.objectContaining({
          cache: 'no-store',
        })
      );
    });

    // Companion name displays properly
    expect(await screen.findByText('Maya')).toBeInTheDocument();
  });

  it('handles 404 from /api/avatars/active gracefully and falls back to default companion', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/avatars/active') {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ detail: 'No active avatar found' }),
        });
      }
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: [] }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }
      if (url === '/api/voice/greeting') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversation_id: 'conv-1',
            reply_text: 'Hi there!',
            companion_id: 'comp-1',
            companion_name: 'Maya',
            audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            audio_format: 'wav',
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL in mock: ${url}`));
    });

    render(<ChatPage />);

    // Companion should fall back to default companion Maya
    expect(await screen.findByText('Maya')).toBeInTheDocument();
  });
});
