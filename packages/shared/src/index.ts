export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Companion {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string;
  personality: Record<string, unknown>;
  modelConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
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

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokenCount: number | null;
  model: string | null;
  toolCalls: unknown | null;
  toolCallId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Memory {
  id: string;
  userId: string;
  companionId: string;
  conversationId: string | null;
  content: string;
  memoryType: "preference" | "fact" | "event" | "relationship" | "goal" | "correction";
  category: string | null;
  source: "user_explicit" | "user_correction" | "model_inference" | "conversation_summary";
  confidence: number;
  isSensitive: boolean;
  consentStatus: "pending" | "approved" | "denied" | "auto_approved";
  consentRequestedAt: string | null;
  consentGrantedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supersededBy: string | null;
}

export interface Avatar {
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

export interface AvatarConfig {
  version: number;
  layers: AvatarLayer[];
}

export interface AvatarLayer {
  type: "skin" | "eyes" | "hair" | "clothing" | "accessory" | "background";
  variant: string;
  color?: string;
  zIndex: number;
  visible: boolean;
}

export interface AvatarAsset {
  id: string;
  layerType: string;
  variant: string;
  assetUrl: string;
  metadata: Record<string, unknown>;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface HealthResponse {
  status: "ok" | "error";
  service: string;
  timestamp?: string;
  database?: "connected" | "disconnected";
  error?: string;
}

export interface ApiError {
  detail: string;
  code?: string;
  fields?: Record<string, string[]>;
}

export type MemoryType = Memory["memoryType"];
export type MemorySource = Memory["source"];
export type ConsentStatus = Memory["consentStatus"];
export type MessageRole = Message["role"];
export type AvatarLayerType = AvatarLayer["type"];