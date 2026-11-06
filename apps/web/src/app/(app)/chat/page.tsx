'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [newConversationCompanionId, setNewConversationCompanionId] = useState('');
  const [companions, setCompanions] = useState<Companion[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function handleStopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
        if (data.conversations.length > 0 && !activeConversationId) {
          setActiveConversationId(data.conversations[0].id);
          loadMessages(data.conversations[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [activeConversationId]);

  const loadCompanions = useCallback(async () => {
    try {
      const response = await fetch('/api/companions');
      if (response.ok) {
        const data = await response.json();
        setCompanions(data.companions);
        if (data.companions.length > 0 && !newConversationCompanionId) {
          setNewConversationCompanionId(data.companions[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load companions:', err);
    }
  }, [newConversationCompanionId]);

  useEffect(() => {
    if (!authLoading) {
      loadConversations();
      loadCompanions();
    }
  }, [authLoading, loadConversations, loadCompanions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages(conversationId: string) {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  async function handleConversationSelect(conversationId: string) {
    if (isSending && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveConversationId(conversationId);
    setMessages([]);
    await loadMessages(conversationId);
  }

  async function handleNewConversation() {
    if (!newConversationCompanionId) return;

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companion_id: newConversationCompanionId,
          title: newConversationTitle || undefined,
        }),
      });

      if (response.ok) {
        const conversation = await response.json();
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversationId(conversation.id);
        setMessages([]);
        setShowNewConversation(false);
        setNewConversationTitle('');
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create conversation');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeConversationId || isSending) return;

    const messageContent = input.trim();
    setInput('');
    setIsSending(true);
    setError('');

    const tempUserId = `user-${Date.now()}`;
    const tempAssistantId = `assistant-temp-${Date.now()}`;

    // Add user message and assistant placeholder immediately
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        conversation_id: activeConversationId!,
        role: 'user',
        content: messageContent,
        token_count: null,
        model: null,
        tool_calls: null,
        tool_call_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      },
      {
        id: tempAssistantId,
        conversation_id: activeConversationId!,
        role: 'assistant',
        content: '',
        token_count: null,
        model: null,
        tool_calls: null,
        tool_call_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedContent = '';

    try {
      const response = await fetch('/api/conversations/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          conversation_id: activeConversationId,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
        throw new Error(data.detail || 'Failed to send message');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              currentEvent = '';
              continue;
            }
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              try {
                const parsed = JSON.parse(trimmed.slice(5).trim());
                if (currentEvent === 'chunk') {
                  accumulatedContent += parsed.content || '';
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tempAssistantId
                        ? { ...m, content: accumulatedContent }
                        : m
                    )
                  );
                } else if (currentEvent === 'completion') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tempAssistantId
                        ? {
                            ...m,
                            id: parsed.message_id || m.id,
                            content: parsed.content || accumulatedContent,
                            model: parsed.model,
                            token_count: parsed.token_count,
                            metadata: { finish_reason: parsed.finish_reason },
                          }
                        : m
                    )
                  );
                } else if (currentEvent === 'error') {
                  throw new Error(parsed.detail || 'Streaming error occurred');
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && currentEvent === 'error') {
                  throw parseErr;
                }
              }
            }
          }
        }
      } else {
        const data = await response.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  id: data.message_id || m.id,
                  content: data.content,
                  token_count: data.token_count,
                  model: data.model,
                  metadata: { finish_reason: data.finish_reason },
                }
              : m
          )
        );
      }

      loadConversations();
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  content: accumulatedContent
                    ? `${accumulatedContent} (Generation stopped)`
                    : '(Generation stopped)',
                  metadata: { finish_reason: 'interrupted' },
                }
              : m
          )
        );
      } else {
        if (!accumulatedContent) {
          setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
        }
        setError(errorObj?.message || 'Failed to send message');
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const conversationList = conversations.length === 0 ? (
    <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
      No conversations yet. Click "New Chat" to start.
    </div>
  ) : (
    conversations.map((conv) => {
      return (
        <button
          key={conv.id}
          onClick={() => handleConversationSelect(conv.id)}
          className={cn(
            'w-full text-left p-3 rounded-lg transition-colors',
            activeConversationId === conv.id
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <p className="font-medium truncate">{conv.title || 'Untitled'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
            {conv.message_count} messages
          </p>
        </button>
      );
    })
  );

  const messagesList = messages.length === 0 ? (
    <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
      <div className="text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h4M12 12h4m-4 4h4m-4-8v8M6 10a2 2 0 114 0 2 2 0 01-4 0zM18 10a2 2 0 114 0 2 2 0 01-4 0z" />
        </svg>
        <p className="text-lg font-medium">No messages yet</p>
        <p className="text-sm mt-1">Start the conversation!</p>
      </div>
    </div>
  ) : (
    messages.map((msg) => {
      return (
        <div
          key={msg.id}
          className={cn(
            'flex gap-3 max-w-[80%]',
            msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              msg.role === 'user'
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            )}
          >
            {msg.role === 'user' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h4M12 12h4m-4 4h4m-4-8v8M6 10a2 2 0 114 0 2 2 0 01-4 0zM18 10a2 2 0 114 0 2 2 0 01-4 0z" />
              </svg>
            )}
          </div>
          <div className={cn(
            'max-w-[70%] px-4 py-2 rounded-2xl',
            msg.role === 'user'
              ? 'bg-primary-600 text-white rounded-tr-none'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none'
          )}
          >
            {msg.content ? (
              <p className="whitespace-pre-wrap">
                {msg.content}
                {isSending && msg.id.startsWith('assistant-temp-') && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-primary-500 animate-pulse align-middle" />
                )}
              </p>
            ) : (
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      );
    })
  );

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-0rem)] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Chat</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Chat with your AI companion</p>
        </div>
        <button
          onClick={() => setShowNewConversation(true)}
          className={cn(
            'px-4 py-2 rounded-lg font-medium text-white text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
            'transition-colors'
          )}
          style={{ backgroundColor: 'rgb(14 165 233)' }}
        >
          <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </header>

      {/* Error toast */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation sidebar */}
        <aside className="w-80 lg:w-96 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hidden lg:flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">Conversations</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {conversationList}
          </div>
        </aside>

        {/* Mobile conversation selector */}
        <div className="lg:hidden mb-4">
          <select
            value={activeConversationId || ''}
            onChange={(e) => handleConversationSelect(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">Select a conversation</option>
            {conversations.map((conv) => {
              return (
                <option key={conv.id} value={conv.id}>
                  {conv.title || 'Untitled'}
                </option>
              );
            })}
          </select>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConversationId ? (
            <div>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={messagesEndRef}>
                {messagesList}
              </div>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none min-h-[48px] max-h-48"
                    disabled={isSending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e as unknown as React.FormEvent);
                      }
                    }}
                  />
                  {isSending ? (
                    <button
                      type="button"
                      onClick={handleStopGeneration}
                      className={cn(
                        'px-5 py-3 rounded-xl font-medium text-white flex items-center justify-center',
                        'bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm',
                        'focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2'
                      )}
                      title="Stop generation"
                    >
                      <svg className="w-5 h-5 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      <span className="text-xs font-semibold">Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={!input.trim()}
                      className={cn(
                        'px-6 py-3 rounded-xl font-medium text-white flex items-center justify-center',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-colors'
                      )}
                      style={{ backgroundColor: 'rgb(14 165 233)' }}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-24 h-24 mx-auto mb-4 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h4M12 12h4m-4 4h4m-4-8v8M6 10a2 2 0 114 0 2 2 0 01-4 0zM18 10a2 2 0 114 0 2 2 0 01-4 0z" />
                </svg>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No conversation selected</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">Select a conversation or start a new one</p>
                <button
                  onClick={() => setShowNewConversation(true)}
                  className={cn(
                    'px-6 py-3 rounded-lg font-medium text-white',
                    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                    'transition-colors'
                  )}
                  style={{ backgroundColor: 'rgb(14 165 233)' }}
                >
                  <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
New Chat
                  </button>
                </div>
              </div>
            )}

          {/* New conversation modal */}
          {showNewConversation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-md shadow-xl">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">New Conversation</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Companion
                    </label>
                    <select
                      value={newConversationCompanionId}
                      onChange={(e) => setNewConversationCompanionId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {companions.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Title (optional)
                    </label>
                    <input
                      type="text"
                      value={newConversationTitle}
                      onChange={(e) => setNewConversationTitle(e.target.value)}
                      placeholder="Untitled conversation"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={() => setShowNewConversation(false)}
                      className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNewConversation}
                      disabled={!newConversationCompanionId}
                      className={cn(
                        'px-4 py-2 rounded-lg font-medium text-white',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      style={{ backgroundColor: 'rgb(14 165 233)' }}
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Type definitions
interface Conversation {
  id: string;
  user_id: string;
  companion_id: string;
  title: string | null;
  summary: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  token_count: number | null;
  model: string | null;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Companion {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  personality: Record<string, unknown>;
  llm_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}