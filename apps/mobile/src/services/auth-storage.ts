/**
 * Secure authentication storage for mobile application.
 * Persists JWT access and refresh tokens using expo-secure-store (Android Keystore / iOS Keychain).
 * Provides an in-memory fallback when native secure storage is unavailable (e.g. in test runners).
 */

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'ai_companion_access_token';
const REFRESH_TOKEN_KEY = 'ai_companion_refresh_token';

// In-memory fallback cache
const memoryCache = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (await isSecureStoreAvailable()) {
    try {
      const val = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (val !== undefined && val !== null) return val;
      return memoryCache.get(ACCESS_TOKEN_KEY) || null;
    } catch {
      return memoryCache.get(ACCESS_TOKEN_KEY) || null;
    }
  }
  return memoryCache.get(ACCESS_TOKEN_KEY) || null;
}

export async function setAccessToken(token: string): Promise<void> {
  memoryCache.set(ACCESS_TOKEN_KEY, token);
  if (await isSecureStoreAvailable()) {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    } catch {
      // In-memory fallback retained
    }
  }
}

export async function getRefreshToken(): Promise<string | null> {
  if (await isSecureStoreAvailable()) {
    try {
      const val = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (val !== undefined && val !== null) return val;
      return memoryCache.get(REFRESH_TOKEN_KEY) || null;
    } catch {
      return memoryCache.get(REFRESH_TOKEN_KEY) || null;
    }
  }
  return memoryCache.get(REFRESH_TOKEN_KEY) || null;
}

export async function setRefreshToken(token: string): Promise<void> {
  memoryCache.set(REFRESH_TOKEN_KEY, token);
  if (await isSecureStoreAvailable()) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } catch {
      // In-memory fallback retained
    }
  }
}

export async function setTokens(accessToken: string, refreshToken?: string): Promise<void> {
  await setAccessToken(accessToken);
  if (refreshToken) {
    await setRefreshToken(refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  memoryCache.delete(ACCESS_TOKEN_KEY);
  memoryCache.delete(REFRESH_TOKEN_KEY);
  if (await isSecureStoreAvailable()) {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Retained clean state
    }
  }
}
