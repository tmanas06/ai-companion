/**
 * Persistent AETHRA backend server URL.
 *
 * The AI runs on the user's own machine (FastAPI + Ollama/0G). The APK stores
 * the LAN URL to that machine so the user sets it once and it survives restart.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SERVER_URL_KEY = 'aethra_server_url';

function defaultServerUrl(): string {
  const envUrl = process.env['EXPO_PUBLIC_API_URL'];
  if (envUrl) return envUrl;
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://localhost:8000';
}

export function normalizeServerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export async function getPersistedServerUrl(): Promise<string | null> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const saved = await SecureStore.getItemAsync(SERVER_URL_KEY);
    return saved || null;
  } catch {
    return null;
  }
}

export async function setPersistedServerUrl(url: string): Promise<string> {
  const normalized = normalizeServerUrl(url);
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SERVER_URL_KEY, normalized);
    }
  } catch {
    // Secure storage unavailable; in-memory override via api-client still applies.
  }
  return normalized;
}

export async function clearPersistedServerUrl(): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(SERVER_URL_KEY);
    }
  } catch {
    // ignore
  }
}

export async function resolveInitialServerUrl(): Promise<string> {
  const persisted = await getPersistedServerUrl();
  return persisted || defaultServerUrl();
}
