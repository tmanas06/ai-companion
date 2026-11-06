/**
 * Avatar Persistence Service for Mobile.
 * Consumes the existing FastAPI active avatar endpoints with @ai-companion/shared types.
 */

import {
  Avatar3DConfig,
  migrateAvatarConfig,
} from '@ai-companion/shared';
import { fetchWithAuth } from './api-client';
import { clearModelCache } from './model-cache-manager';

export interface StoredAvatar {
  id: string;
  name: string;
  config: Avatar3DConfig;
  isActive: boolean;
}

// In-memory cache for fast screen transitions and offline cold-starts
let cachedAvatar: StoredAvatar | null = null;

export function getCachedAvatar(): StoredAvatar | null {
  return cachedAvatar;
}

export function setCachedAvatar(avatar: StoredAvatar | null) {
  cachedAvatar = avatar;
}

export function clearAvatarCache() {
  cachedAvatar = null;
}

export async function clearAllAvatarData(includeModelFiles = false): Promise<void> {
  clearAvatarCache();
  if (includeModelFiles) {
    await clearModelCache();
  }
}

/**
 * Loads the authenticated user's active 3D avatar configuration.
 * Returns null if no avatar has been customized yet (graceful fallback).
 */
export async function getActiveAvatar(): Promise<{ avatar: StoredAvatar | null; error?: string }> {
  const res = await fetchWithAuth<any>('/api/v1/avatars/active', {
    method: 'GET',
  });

  if (res.ok && res.data) {
    const raw = res.data;
    const validatedConfig = migrateAvatarConfig(raw.config);
    const stored: StoredAvatar = {
      id: raw.id,
      name: raw.name || 'My Companion',
      config: validatedConfig,
      isActive: raw.is_active ?? true,
    };
    cachedAvatar = stored;
    return { avatar: stored };
  }

  if (res.status === 404) {
    // Graceful fallback when no avatar has been saved yet
    cachedAvatar = null;
    return { avatar: null };
  }

  return { avatar: cachedAvatar, error: res.error };
}

/**
 * Saves or updates an avatar configuration through the authenticated API.
 */
export async function saveAvatar(
  name: string,
  config: Avatar3DConfig,
  avatarId?: string | null
): Promise<{ avatar: StoredAvatar | null; error?: string }> {
  const endpoint = avatarId ? `/api/v1/avatars/${avatarId}` : '/api/v1/avatars';
  const method = avatarId ? 'PATCH' : 'POST';

  const res = await fetchWithAuth<any>(endpoint, {
    method,
    body: JSON.stringify({
      name,
      config,
    }),
  });

  if (res.ok && res.data) {
    const raw = res.data;
    const validatedConfig = migrateAvatarConfig(raw.config);
    const stored: StoredAvatar = {
      id: raw.id,
      name: raw.name || name,
      config: validatedConfig,
      isActive: raw.is_active ?? true,
    };
    cachedAvatar = stored;
    return { avatar: stored };
  }

  return { avatar: null, error: res.error || 'Failed to save avatar configuration' };
}
