/**
 * AI backend reachability monitor.
 *
 * Pings the FastAPI /api/v1/health endpoint on a schedule and on demand.
 * Used by the chat screen to show real errors instead of fake replies when
 * the user's local AETHRA backend is unreachable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './api-client';

export type AiReachability = 'checking' | 'online' | 'offline';

export interface AiStatus {
  state: AiReachability;
  latencyMs: number | null;
  lastCheckedAt: Date | null;
  error: string | null;
  baseUrl: string;
}

const PING_TIMEOUT_MS = 4000;
const POLL_INTERVAL_ONLINE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_OFFLINE_MS = 15 * 1000;

export async function pingAiBackend(baseUrl?: string): Promise<AiStatus> {
  const url = baseUrl || getApiBaseUrl();
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/api/v1/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        state: 'offline',
        latencyMs,
        lastCheckedAt: new Date(),
        error: `Server responded with HTTP ${res.status}`,
        baseUrl: url,
      };
    }
    return {
      state: 'online',
      latencyMs,
      lastCheckedAt: new Date(),
      error: null,
      baseUrl: url,
    };
  } catch (err) {
    clearTimeout(timer);
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `No response within ${PING_TIMEOUT_MS / 1000}s`
          : err.message
        : 'Unknown network error';
    return {
      state: 'offline',
      latencyMs: null,
      lastCheckedAt: new Date(),
      error: message,
      baseUrl: url,
    };
  }
}

export function useAiStatus(): AiStatus & { recheck: () => Promise<void> } {
  const [status, setStatus] = useState<AiStatus>({
    state: 'checking',
    latencyMs: null,
    lastCheckedAt: null,
    error: null,
    baseUrl: getApiBaseUrl(),
  });
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recheck = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus((prev) => ({ ...prev, state: 'checking' }));
    const next = await pingAiBackend();
    if (!mountedRef.current) return;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void recheck();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [recheck]);

  useEffect(() => {
    if (status.state === 'checking') return;
    const delay =
      status.state === 'online' ? POLL_INTERVAL_ONLINE_MS : POLL_INTERVAL_OFFLINE_MS;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void recheck();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status.state, recheck]);

  return { ...status, recheck };
}
