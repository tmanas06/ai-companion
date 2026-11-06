/**
 * Authenticated API client for mobile application.
 * Connects to the FastAPI backend endpoints using standard Bearer authorization headers.
 */

import { Platform } from 'react-native';
import { getAccessToken, clearTokens } from './auth-storage';

let customBaseUrl: string | null = null;

export function setCustomApiBaseUrl(url: string | null) {
  customBaseUrl = url;
}

export function getApiBaseUrl(): string {
  if (customBaseUrl) return customBaseUrl;
  if (process.env['EXPO_PUBLIC_API_URL']) return process.env['EXPO_PUBLIC_API_URL'];
  
  // Default Android emulator maps 10.0.2.2 to host machine localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function fetchWithAuth<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Clear token on definitive authentication failure
      await clearTokens();
    }

    const contentType = res.headers.get('content-type') || '';
    let parsed: any = null;
    if (contentType.includes('application/json')) {
      parsed = await res.json();
    } else {
      const text = await res.text();
      parsed = text ? { detail: text } : null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: parsed?.detail || `HTTP Error ${res.status}`,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsed as T,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    return {
      ok: false,
      status: 0,
      data: null,
      error: message,
    };
  }
}
