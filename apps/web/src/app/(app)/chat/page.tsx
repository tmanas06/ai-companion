'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { CompanionPersonalityConfig } from '@/lib/companion-presets';
import { AvatarRenderer } from '@/components/companion/AvatarRenderer';

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
  system_prompt?: string | null;
  personality?: (CompanionPersonalityConfig & Record<string, unknown>) | null;
  llm_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCompanionId = searchParams?.get('companionId');

  const { user, isLoading: authLoading } = useAuth();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');

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

  // 1. Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // 2. Load companions
  const loadCompanions = useCallback(async () => {
    try {
      const response = await fetch('/api/companions');
      if (response.ok) {
        const data = await response.json();
        const list: Companion[] = Array.isArray(data)
          ? data
          : data.items || data.companions || [];
        setCompanions(list);

        // If user has 0 companions, redirect to onboarding (Phase 2 requirement)
        if (list.length === 0) {
          router.push('/onboarding/companion');
          return;
        }

        // Determine which companion to select
        let targetCompanion: Companion | null = list[0] ?? null;
        if (queryCompanionId) {
          const match = list.find((c) => c.id === queryCompanionId);
          if (match) targetCompanion = match;
        }
        setSelectedCompanion(targetCompanion);
      }
    } catch (err) {
      console.error('Failed to load companions:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryCompanionId]);

  useEffect(() => {
    if (!authLoading && user) {
      loadCompanions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // 3. Load conversations for selected companion
  const loadConversations = useCallback(
    async (companionId?: string) => {
      try {
        const response = await fetch('/api/conversations');
        if (response.ok) {
          const data = await response.json();
          const allConvs: Conversation[] = data.conversations || [];
          setConversations(allConvs);

          const matchingConvs = companionId
            ? allConvs.filter((c) => c.companion_id === companionId)
            : allConvs;

          const candidateList = matchingConvs.length > 0 ? matchingConvs : allConvs;

          if (candidateList.length > 0) {
            const firstId = candidateList[0]!.id;
            setActiveConversationId((currentActiveId) => {
              if (!currentActiveId) {
                loadMessages(firstId);
                return firstId;
              }
              return currentActiveId;
            });
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedCompanion) {
      loadConversations(selectedCompanion.id);
    }
  }, [selectedCompanion, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages(conversationId: string) {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
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

  async function handleCompanionChange(companionId: string) {
    const comp = companions.find((c) => c.id === companionId);
    if (comp) {
      if (isSending && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSelectedCompanion(comp);
      setActiveConversationId(null);
      setMessages([]);
    }
  }

  async function handleNewConversation() {
    if (!selectedCompanion) return;

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companion_id: selectedCompanion.id,
          title: newConversationTitle || undefined,
        }),
      });

      if (response.ok) {
        const conversation: Conversation = await response.json();
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
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const companionIdToSend = selectedCompanion?.id || activeConv?.companion_id || companions[0]?.id;
    if (!input.trim() || isSending || (!companionIdToSend && !activeConversationId)) return;

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
        conversation_id: activeConversationId || 'pending',
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
        conversation_id: activeConversationId || 'pending',
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
      const requestPayload: {
        message: string;
        stream: boolean;
        companion_id?: string;
        conversation_id?: string;
      } = {
        message: messageContent,
        stream: true,
      };

      if (companionIdToSend) {
        requestPayload.companion_id = companionIdToSend;
      }

      if (activeConversationId) {
        requestPayload.conversation_id = activeConversationId;
      }

      const response = await fetch('/api/conversations/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
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
                      m.id === tempAssistantId ? { ...m, content: accumulatedContent } : m
                    )
                  );
                } else if (currentEvent === 'completion') {
                  if (parsed.conversation_id && !activeConversationId) {
                    setActiveConversationId(parsed.conversation_id);
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tempAssistantId
                        ? {
                            ...m,
                            id: parsed.message_id || m.id,
                            conversation_id: parsed.conversation_id || m.conversation_id,
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
        if (data.conversation_id && !activeConversationId) {
          setActiveConversationId(data.conversation_id);
        }
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

      if (companionIdToSend) {
        loadConversations(companionIdToSend);
      }
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading companion chat...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <p>Redirecting to sign in...</p>
      </div>
    );
  }

  const companionPersonality = selectedCompanion?.personality || {};
  const traits = (companionPersonality.traits as string[]) || [];
  const companionBio = (companionPersonality.bio as string) || '';
  const avatarConfig = companionPersonality.avatar_config;
  const companionStyle = (companionPersonality.avatar_style as string) || 'Illustrated';

  const matchingConversations = selectedCompanion
    ? conversations.filter((c) => c.companion_id === selectedCompanion.id)
    : conversations;

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
      {/* Top Companion Banner & Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Companion Avatar & Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
            {avatarConfig ? (
              <AvatarRenderer config={avatarConfig} size={56} />
            ) : companionPersonality.avatar_preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companionPersonality.avatar_preview_url as string}
                alt={selectedCompanion?.name || 'Companion'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary-600 text-white font-bold text-xl flex items-center justify-center">
                {selectedCompanion?.name?.charAt(0) || 'C'}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {selectedCompanion?.name || 'Companion'}
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold capitalize">
                {companionStyle}
              </span>
            </div>

            {traits.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-1">
                {traits.join(' • ')}
              </p>
            )}
          </div>
        </div>

        {/* Companion Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {companions.length > 1 && (
            <select
              value={selectedCompanion?.id || ''}
              onChange={(e) => handleCompanionChange(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Switch companion"
            >
              {companions.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  Switch to {comp.name}
                </option>
              ))}
            </select>
          )}

          {selectedCompanion && (
            <Link
              href={`/onboarding/companion?editId=${selectedCompanion.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Customize
            </Link>
          )}

          <Link
            href="/memories"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Memories
          </Link>

          <Link
            href="/companion"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
            </svg>
            Hub
          </Link>

          <button
            onClick={() => setShowNewConversation(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Chat Body */}
      <div className="flex-1 flex overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {/* Conversation sidebar */}
        <aside className="w-72 lg:w-80 flex flex-col border-r border-slate-200 dark:border-slate-800 hidden md:flex">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Conversations
            </h3>
            <span className="text-xs text-slate-400">{matchingConversations.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {matchingConversations.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs px-4">
                No past chats with {selectedCompanion?.name}. Send a message to start!
              </div>
            ) : (
              matchingConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleConversationSelect(conv.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl transition-all',
                    activeConversationId === conv.id
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  )}
                >
                  <p className="text-sm truncate">{conv.title || 'Conversation'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {conv.message_count} {conv.message_count === 1 ? 'message' : 'messages'}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat message thread & composer */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Messages container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" ref={messagesEndRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center max-w-md mx-auto">
                <div className="w-20 h-20 rounded-3xl overflow-hidden mb-4 shadow-md bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  {avatarConfig ? (
                    <AvatarRenderer config={avatarConfig} size={80} />
                  ) : companionPersonality.avatar_preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={companionPersonality.avatar_preview_url as string}
                      alt={selectedCompanion?.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-primary-600 text-white font-bold text-2xl flex items-center justify-center">
                      {selectedCompanion?.name?.charAt(0)}
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Say hello to {selectedCompanion?.name}!
                </h3>
                {companionBio && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    &ldquo;{companionBio}&rdquo;
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {[
                    `Hi ${selectedCompanion?.name}, how are you today?`,
                    'Tell me about yourself!',
                    'What kind of adventures do you like?',
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      onClick={() => setInput(promptText)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary-500 text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
                    >
                      &ldquo;{promptText}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-3 max-w-[85%] sm:max-w-[75%]',
                      isUser ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
                    )}
                  >
                    {/* Avatar Icon */}
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-xs">
                      {isUser ? (
                        <div className="w-full h-full bg-primary-600 text-white flex items-center justify-center text-xs font-semibold">
                          You
                        </div>
                      ) : avatarConfig ? (
                        <AvatarRenderer config={avatarConfig} size={32} />
                      ) : companionPersonality.avatar_preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={companionPersonality.avatar_preview_url as string}
                          alt={selectedCompanion?.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
                          {selectedCompanion?.name?.charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Bubble */}
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-xs',
                        isUser
                          ? 'bg-primary-600 text-white rounded-tr-none'
                          : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-white rounded-tl-none'
                      )}
                    >
                      {msg.content ? (
                        <p className="whitespace-pre-wrap break-words">
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
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none min-h-[46px] max-h-36 text-sm"
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
                  className="px-4 py-3 rounded-xl font-medium text-white flex items-center justify-center bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  title="Stop generation"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <span className="text-xs font-semibold">Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  className="px-5 py-3 rounded-xl font-medium text-white flex items-center justify-center bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* New conversation modal */}
      {showNewConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              New Conversation with {selectedCompanion?.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Topic / Title (optional)
                </label>
                <input
                  type="text"
                  value={newConversationTitle}
                  onChange={(e) => setNewConversationTitle(e.target.value)}
                  placeholder="e.g. Planning weekend trip, Morning chat"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewConversation(false)}
                  className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewConversation}
                  className="px-4 py-2 rounded-xl font-medium text-white text-xs bg-primary-600 hover:bg-primary-500 shadow-sm"
                >
                  Start Conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}