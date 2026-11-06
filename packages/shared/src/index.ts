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

export interface CompanionCreate {
  name: string;
  systemPrompt?: string;
  personality?: Record<string, unknown>;
  llmConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CompanionUpdate {
  name?: string;
  systemPrompt?: string;
  personality?: Record<string, unknown>;
  llmConfig?: Record<string, unknown>;
  isActive?: boolean;
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
  config: AvatarConfig | Avatar3DConfig;
  previewUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarConfig {
  version: 1;
  layers: AvatarLayer[];
}

export interface AvatarLayer {
  type: "skin" | "eyes" | "hair" | "clothing" | "accessory" | "background";
  variant: string;
  color?: string;
  zIndex: number;
  visible: boolean;
}

export type SupportedBaseModelId =
  | "aria_photorealistic"
  | "marcus_photorealistic"
  | "human_female_v1"
  | "human_male_v1"
  | "human_universal_v1";

export type SupportedHairAssetId =
  | "ponytail01"
  | "short02"
  | "bob01"
  | "wavy_long"
  | "buzz_cut"
  | "afro_fade"
  | "none";

export type SupportedClothingAssetId =
  | "female_elegantsuit01"
  | "male_casualsuit01"
  | "casual_tshirt_jeans"
  | "smart_blazer"
  | "athletic_wear"
  | "default";

export type SupportedAccessoryAssetId =
  | "glasses_round"
  | "glasses_classic"
  | "earrings_studs"
  | "necklace_simple"
  | "none";

export interface FaceMorphParameters {
  jawWidth: number;
  jawAngle?: number;
  chinLength: number;
  chinProminence?: number;
  cheekboneHeight: number;
  cheekboneFullness?: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeSlant?: number;
  noseLength: number;
  noseBridgeWidth: number;
  noseTipAngle?: number;
  noseFlare?: number;
  lipFullnessUpper: number;
  lipFullnessLower: number;
  mouthWidth: number;
  earSize?: number;
}

export interface MaterialParameters {
  skinTone: string;
  skinRoughness?: number;
  eyeColor: string;
  eyeRoughness?: number;
  teethRoughness?: number;
}

export interface HairConfiguration {
  assetId: SupportedHairAssetId;
  color: string;
  roughness?: number;
}

export interface BodyParameters {
  height: number;
  muscle: number;
  weight: number;
}

export interface ClothingConfiguration {
  topAssetId?: SupportedClothingAssetId;
  topColor?: string;
  bottomAssetId?: SupportedClothingAssetId;
  bottomColor?: string;
  shoesAssetId?: SupportedClothingAssetId;
  outfitPresetId?: SupportedClothingAssetId;
}

export interface AccessoryItem {
  assetId: SupportedAccessoryAssetId;
  slot: "eyes" | "ears" | "neck" | "wrist";
  color?: string;
}

export interface BehaviorConfiguration {
  defaultPose?: "neutral" | "relaxed" | "confident" | "friendly";
  blinkFrequencyMultiplier?: number;
  smileTendency?: number;
}

export interface Avatar3DConfig {
  version: 2;
  baseModelId: SupportedBaseModelId;
  face: FaceMorphParameters;
  materials: MaterialParameters;
  hair: HairConfiguration;
  body: BodyParameters;
  clothing: ClothingConfiguration;
  accessories?: AccessoryItem[];
  behavior?: BehaviorConfiguration;
}

export type AnyAvatarConfig = AvatarConfig | Avatar3DConfig;

export const DEFAULT_AVATAR_3D_CONFIG: Avatar3DConfig = {
  version: 2,
  baseModelId: "aria_photorealistic",
  face: {
    jawWidth: 0.5,
    jawAngle: 0.5,
    chinLength: 0.5,
    chinProminence: 0.5,
    cheekboneHeight: 0.5,
    cheekboneFullness: 0.5,
    eyeSize: 0.5,
    eyeSpacing: 0.5,
    eyeSlant: 0.5,
    noseLength: 0.5,
    noseBridgeWidth: 0.5,
    noseTipAngle: 0.5,
    noseFlare: 0.5,
    lipFullnessUpper: 0.5,
    lipFullnessLower: 0.5,
    mouthWidth: 0.5,
    earSize: 0.5,
  },
  materials: {
    skinTone: "#E8B590",
    skinRoughness: 0.6,
    eyeColor: "#3B2219",
    eyeRoughness: 0.1,
    teethRoughness: 0.16,
  },
  hair: {
    assetId: "ponytail01",
    color: "#2C1B14",
    roughness: 0.8,
  },
  body: {
    height: 1.0,
    muscle: 0.5,
    weight: 0.5,
  },
  clothing: {
    outfitPresetId: "female_elegantsuit01",
    topAssetId: "female_elegantsuit01",
    bottomAssetId: "female_elegantsuit01",
  },
  accessories: [],
  behavior: {
    defaultPose: "relaxed",
    blinkFrequencyMultiplier: 1.0,
    smileTendency: 0.5,
  },
};

export function migrateAvatarConfig(raw: unknown): Avatar3DConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AVATAR_3D_CONFIG };
  }
  const obj = raw as Record<string, unknown>;
  if (
    obj["version"] === 2 &&
    obj["face"] &&
    obj["materials"] &&
    obj["hair"] &&
    obj["body"] &&
    obj["clothing"]
  ) {
    return obj as unknown as Avatar3DConfig;
  }
  // Convert from legacy 2D layers or partial payload
  return {
    ...DEFAULT_AVATAR_3D_CONFIG,
    version: 2,
  };
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
export type PrivacyMode = "strict-local" | "private-machine" | "cloud-allowed";

export interface ChatStreamStartEvent {
  event: "start";
  data: {
    conversation_id: string;
    user_message_id: string;
    model: string;
  };
}

export interface ChatStreamChunkEvent {
  event: "chunk";
  data: {
    content: string;
  };
}

export interface ChatStreamCompletionEvent {
  event: "completion";
  data: {
    conversation_id: string;
    message_id: string;
    content: string;
    model: string;
    token_count: number | null;
    finish_reason: string | null;
  };
}

export interface ChatStreamErrorEvent {
  event: "error";
  data: {
    detail: string;
    error_type?: string;
  };
}

export type ChatStreamEvent =
  | ChatStreamStartEvent
  | ChatStreamChunkEvent
  | ChatStreamCompletionEvent
  | ChatStreamErrorEvent;