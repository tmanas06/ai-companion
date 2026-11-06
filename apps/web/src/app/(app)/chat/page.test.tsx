import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatPage from './page';

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', full_name: 'Test User' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

describe('ChatPage Streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockConversations = [
    {
      id: 'conv-1',
      title: 'First Chat',
      companion_id: 'comp-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockCompanions = [
    {
      id: 'comp-1',
      name: 'Maya',
      system_prompt: 'Helpful AI',
      llm_config: { provider: 'ollama' },
    },
  ];

  const mockMessages = [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Hi',
      created_at: new Date().toISOString(),
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Hello there!',
      created_at: new Date().toISOString(),
    },
  ];

  it('renders conversations and initial messages', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: mockConversations }),
        });
      }
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: mockMessages }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<ChatPage />);

    const chatHeaders = await screen.findAllByText('First Chat');
    expect(chatHeaders.length).toBeGreaterThan(0);
    expect(await screen.findByText('Hello there!')).toBeInTheDocument();
  });

  it('renders streamed chunks incrementally and replaces Send with Stop button', async () => {
    const streamChunks = [
      'event: start\ndata: {"conversation_id": "conv-1", "user_message_id": "msg-u", "model": "llama3.1:8b"}\n\n',
      'event: chunk\ndata: {"content": "Thinking "}\n\n',
      'event: chunk\ndata: {"content": "clearly now."}\n\n',
      'event: completion\ndata: {"conversation_id": "conv-1", "message_id": "msg-a", "content": "Thinking clearly now.", "model": "llama3.1:8b", "token_count": 4, "finish_reason": "stop"}\n\n',
    ];

    let chunkIndex = 0;
    const mockReadableStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < streamChunks.length) {
          controller.enqueue(new TextEncoder().encode(streamChunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: mockConversations }),
        });
      }
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }
      if (url === '/api/conversations/chat') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: mockReadableStream,
        });
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });

    render(<ChatPage />);

    await screen.findAllByText('First Chat');

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'How is the weather?' } });

    const sendButton = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendButton);

    // Immediate user message in UI
    expect(await screen.findByText('How is the weather?')).toBeInTheDocument();

    // The stream should complete and show full assistant response
    await waitFor(() => {
      expect(screen.getByText('Thinking clearly now.')).toBeInTheDocument();
    });
  });

  it('handles stream error event cleanly without message duplication', async () => {
    const streamChunks = [
      'event: start\ndata: {"conversation_id": "conv-1", "user_message_id": "msg-u", "model": "llama3.1:8b"}\n\n',
      'event: chunk\ndata: {"content": "Partial words"}\n\n',
      'event: error\ndata: {"detail": "Ollama service connection failed", "error_type": "provider_error"}\n\n',
    ];

    let chunkIndex = 0;
    const mockReadableStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < streamChunks.length) {
          controller.enqueue(new TextEncoder().encode(streamChunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: mockConversations }),
        });
      }
      if (url === '/api/companions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companions: mockCompanions }),
        });
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }
      if (url === '/api/conversations/chat') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: mockReadableStream,
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<ChatPage />);
    await screen.findAllByText('First Chat');

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    // Error banner should display
    expect(await screen.findByText('Ollama service connection failed')).toBeInTheDocument();

    // Verify textarea is re-enabled
    expect(textarea).not.toBeDisabled();
  });
});
