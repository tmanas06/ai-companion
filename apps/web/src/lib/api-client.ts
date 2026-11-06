/**
 * Typed API client for AI Companion backend.
 * Handles authentication, request/response transformation, and error handling.
 */

import {
  RequestOptions,
  buildUrl,
  isSuccessResponse,
  parseApiError,
  keysToCamelCase,
  ApiError,
} from './api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = 'v1';

interface TypedApiClient {
  // Auth
  register: (data: RegisterRequest) => Promise<TokenResponse>;
  login: (data: LoginRequest) => Promise<TokenResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<TokenResponse>;
  me: () => Promise<User>;

  // Conversations
  createConversation: (data: ConversationCreate) => Promise<Conversation>;
  listConversations: (params?: ListParams) => Promise<ConversationListResponse>;
  getConversation: (id: string) => Promise<Conversation>;
  updateConversation: (id: string, data: ConversationUpdate) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  listMessages: (conversationId: string, params?: ListParams) => Promise<MessageListResponse>;
  addMessage: (conversationId: string, data: MessageCreate) => Promise<Message>;
  chat: (request: ChatRequest) => Promise<ChatResponse>;

  // Memories
  createMemory: (data: MemoryCreate) => Promise<Memory>;
  listMemories: (params?: MemoryListParams) => Promise<MemoryListResponse>;
  getPendingConsent: (params?: ListParams) => Promise<MemoryListResponse>;
  searchMemories: (params: SearchParams) => Promise<MemoryListResponse>;
  getMemory: (id: string) => Promise<Memory>;
  updateMemory: (id: string, data: MemoryUpdate) => Promise<Memory>;
  deleteMemory: (id: string) => Promise<void>;
  supersedeMemory: (id: string, data: MemoryCreate) => Promise<Memory>;
  handleConsent: (id: string, action: 'approve' | 'deny') => Promise<ConsentResponse>;

  // Avatars
  createAvatar: (data: AvatarCreate) => Promise<Avatar>;
  listAvatars: (params?: ListParams) => Promise<AvatarListResponse>;
  getActiveAvatar: () => Promise<Avatar>;
  getAvatar: (id: string) => Promise<Avatar>;
  updateAvatar: (id: string, data: AvatarUpdate) => Promise<Avatar>;
  deleteAvatar: (id: string) => Promise<void>;
  activateAvatar: (id: string) => Promise<Avatar>;
  listAvatarAssets: (params?: AssetListParams) => Promise<AvatarAssetListResponse>;
  getAvatarAsset: (id: string) => Promise<AvatarAsset>;
}

// Type definitions matching shared types
interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface Conversation {
  id: string;
  userId: string;
  companionId: string;
  title: string | null;
  summary: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ConversationCreate {
  companionId: string;
  title?: string;
}

interface ConversationUpdate {
  title?: string;
  isArchived?: boolean;
}

interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  pageSize: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokenCount: number | null;
  model: string | null;
  toolCalls: unknown | null;
  toolCallId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface MessageCreate {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokenCount?: number;
  model?: string;
  toolCalls?: unknown;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
}

interface MessageListResponse {
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  companionId?: string;
  stream?: boolean;
}

interface ChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  model: string;
  tokenCount: number | null;
  finishReason: string | null;
}

interface Memory {
  id: string;
  userId: string;
  companionId: string;
  conversationId: string | null;
  content: string;
  memoryType: 'preference' | 'fact' | 'event' | 'relationship' | 'goal' | 'correction';
  category: string | null;
  source: 'user_explicit' | 'user_correction' | 'model_inference' | 'conversation_summary';
  confidence: number;
  isSensitive: boolean;
  consentStatus: 'pending' | 'approved' | 'denied' | 'auto_approved';
  consentRequestedAt: string | null;
  consentGrantedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supersededBy: string | null;
}

interface MemoryCreate {
  companionId: string;
  conversationId?: string;
  content: string;
  memoryType: 'preference' | 'fact' | 'event' | 'relationship' | 'goal' | 'correction';
  category?: string;
  source: 'user_explicit' | 'user_correction' | 'model_inference' | 'conversation_summary';
  confidence: number;
  isSensitive: boolean;
}

interface MemoryUpdate {
  content?: string;
  memoryType?: 'preference' | 'fact' | 'event' | 'relationship' | 'goal' | 'correction';
  category?: string;
  confidence?: number;
  isSensitive?: boolean;
  consentStatus?: 'pending' | 'approved' | 'denied' | 'auto_approved';
}

interface MemoryListResponse {
  memories: Memory[];
  total: number;
  page: number;
  pageSize: number;
}

interface MemoryListParams {
  companionId?: string;
  memoryType?: string;
  consentStatus?: string;
  includeSensitive?: boolean;
  page?: number;
  pageSize?: number;
}

interface SearchParams {
  q: string;
  companionId?: string;
  includeSensitive?: boolean;
  page?: number;
  pageSize?: number;
}

interface ConsentResponse {
  memoryId: string;
  consentStatus: string;
  message: string;
}

interface Avatar {
  id: string;
  userId: string;
  name: string;
  configVersion: number;
  config: AvatarConfig;
  previewUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AvatarConfig {
  version: number;
  layers: AvatarLayer[];
}

interface AvatarLayer {
  type: 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  zIndex: number;
  visible: boolean;
}

interface AvatarCreate {
  name: string;
  config: AvatarConfig;
}

interface AvatarUpdate {
  name?: string;
  config?: AvatarConfig;
  isActive?: boolean;
}

interface AvatarListResponse {
  avatars: Avatar[];
  total: number;
  page: number;
  pageSize: number;
}

interface AvatarAsset {
  id: string;
  layerType: string;
  variant: string;
  assetUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AvatarAssetListResponse {
  assets: AvatarAsset[];
  total: number;
  page: number;
  pageSize: number;
}

interface ListParams {
  page?: number;
  pageSize?: number;
}

interface AssetListParams extends ListParams {
  layerType?: string;
}

class ApiClient implements TypedApiClient {
  private baseUrl: string;
  private getAccessToken: () => string | null;
  private setTokens: (access: string, refresh: string) => void;
  private clearTokens: () => void;
  getRefreshToken?: () => string | null;

  constructor(
    baseUrl: string,
    getAccessToken: () => string | null,
    setTokens: (access: string, refresh: string) => void,
    clearTokens: () => void,
    getRefreshToken?: () => string | null
  ) {
    this.baseUrl = baseUrl;
    this.getAccessToken = getAccessToken;
    this.setTokens = setTokens;
    this.clearTokens = clearTokens;
    this.getRefreshToken = getRefreshToken;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { method = 'GET', headers = {}, body, params, signal } = options;
    const url = buildUrl(this.baseUrl, `/api/${API_VERSION}${path}`, params);

    const authToken = this.getAccessToken();
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (authToken) {
      requestHeaders.Authorization = `Bearer ${authToken}`;
    }

    const requestInit: RequestInit = {
      method,
      headers: requestHeaders,
      signal,
      credentials: 'include', // Important for HttpOnly cookies
    };

    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestInit);

    if (!isSuccessResponse(response)) {
      const error = await parseApiError(response);
      throw new ApiErrorResponse(response.status, error);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();
    return keysToCamelCase(data);
  }

  // Auth
  async register(data: { email: string; password: string; fullName?: string }): Promise<TokenResponse> {
    return this.request<TokenResponse>('/auth/register', {
      method: 'POST',
      body: data,
    });
  }

  async login(data: { email: string; password: string }): Promise<TokenResponse> {
    const response = await fetch(buildUrl(this.baseUrl, `/api/${API_VERSION}/auth/login`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await parseApiError(response);
      throw new ApiErrorResponse(response.status, error);
    }

    const data = await response.json();
    const camelData = keysToCamelCase(data);
    this.setTokens(camelData.accessToken, camelData.refreshToken);
    return camelData;
  }

  async logout(): Promise<void> {
    this.clearTokens();
    // Optionally call backend logout endpoint
    try {
      await fetch(buildUrl(this.baseUrl, `/api/${API_VERSION}/auth/logout`), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore errors
    }
  }

  async refresh(): Promise<TokenResponse> {
    const refreshToken = this.getRefreshToken?.();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(buildUrl(this.baseUrl, `/api/${API_VERSION}/auth/refresh`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include',
    });

    if (!response.ok) {
      this.clearTokens();
      const error = await parseApiError(response);
      throw new ApiErrorResponse(response.status, error);
    }

    const data = await response.json();
    const camelData = keysToCamelCase(data);
    this.setTokens(camelData.accessToken, camelData.refreshToken);
    return camelData;
  }

  async me(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Conversations
  async createConversation(data: ConversationCreate): Promise<Conversation> {
    return this.request<Conversation>('/conversations', {
      method: 'POST',
      body: data,
    });
  }

  async listConversations(params?: ListParams): Promise<ConversationListResponse> {
    return this.request<ConversationListResponse>('/conversations', { params });
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request<Conversation>(`/conversations/${id}`);
  }

  async updateConversation(id: string, data: ConversationUpdate): Promise<Conversation> {
    return this.request<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteConversation(id: string): Promise<void> {
    return this.request<void>(`/conversations/${id}`, { method: 'DELETE' });
  }

  async listMessages(conversationId: string, params?: ListParams): Promise<MessageListResponse> {
    return this.request<MessageListResponse>(`/conversations/${conversationId}/messages`, { params });
  }

  async addMessage(conversationId: string, data: MessageCreate): Promise<Message> {
    return this.request<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: data,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>('/conversations/chat', {
      method: 'POST',
      body: request,
    });
  }

  // Memories
  async createMemory(data: MemoryCreate): Promise<Memory> {
    return this.request<Memory>('/memories', { method: 'POST', body: data });
  }

  async listMemories(params?: MemoryListParams): Promise<MemoryListResponse> {
    return this.request<MemoryListResponse>('/memories', { params });
  }

  async getPendingConsent(params?: ListParams): Promise<MemoryListResponse> {
    return this.request<MemoryListResponse>('/memories/pending-consent', { params });
  }

  async searchMemories(params: SearchParams): Promise<MemoryListResponse> {
    return this.request<MemoryListResponse>('/memories/search', { params });
  }

  async getMemory(id: string): Promise<Memory> {
    return this.request<Memory>(`/memories/${id}`);
  }

  async updateMemory(id: string, data: MemoryUpdate): Promise<Memory> {
    return this.request<Memory>(`/memories/${id}`, { method: 'PATCH', body: data });
  }

  async deleteMemory(id: string): Promise<void> {
    return this.request<void>(`/memories/${id}`, { method: 'DELETE' });
  }

  async supersedeMemory(id: string, data: MemoryCreate): Promise<Memory> {
    return this.request<Memory>(`/memories/${id}/supersede`, { method: 'POST', body: data });
  }

  async handleConsent(id: string, action: 'approve' | 'deny'): Promise<ConsentResponse> {
    return this.request<ConsentResponse>(`/memories/${id}/consent`, {
      method: 'POST',
      body: { action },
    });
  }

  // Avatars
  async createAvatar(data: AvatarCreate): Promise<Avatar> {
    return this.request<Avatar>('/avatars', { method: 'POST', body: data });
  }

  async listAvatars(params?: ListParams): Promise<AvatarListResponse> {
    return this.request<AvatarListResponse>('/avatars', { params });
  }

  async getActiveAvatar(): Promise<Avatar> {
    return this.request<Avatar>('/avatars/active');
  }

  async getAvatar(id: string): Promise<Avatar> {
    return this.request<Avatar>(`/avatars/${id}`);
  }

  async updateAvatar(id: string, data: AvatarUpdate): Promise<Avatar> {
    return this.request<Avatar>(`/avatars/${id}`, { method: 'PATCH', body: data });
  }

  async deleteAvatar(id: string): Promise<void> {
    return this.request<void>(`/avatars/${id}`, { method: 'DELETE' });
  }

  async activateAvatar(id: string): Promise<Avatar> {
    return this.request<Avatar>(`/avatars/${id}/activate`, { method: 'POST' });
  }

  async listAvatarAssets(params?: AssetListParams): Promise<AvatarAssetListResponse> {
    return this.request<AvatarAssetListResponse>('/avatars/assets', { params });
  }

  async getAvatarAsset(id: string): Promise<AvatarAsset> {
    return this.request<AvatarAsset>(`/avatars/assets/${id}`);
  }
}

// Error class for API responses
class ApiErrorResponse extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.detail);
    this.name = 'ApiErrorResponse';
  }
}

// Create singleton instance
let apiClientInstance: ApiClient | null = null;

export function createApiClient(
  getAccessToken: () => string | null,
  setTokens: (access: string, refresh: string) => void,
  clearTokens: () => void,
  getRefreshToken?: () => string | null
): ApiClient {
  apiClientInstance = new ApiClient(API_BASE, getAccessToken, setTokens, clearTokens, getRefreshToken);
  return apiClientInstance;
}

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    throw new Error('API client not initialized. Call createApiClient first.');
  }
  return apiClientInstance;
}