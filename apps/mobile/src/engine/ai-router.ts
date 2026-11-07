/**
 * Chooses between on-device and LAN inference for a chat message.
 *
 * Policy:
 *   - 'on-device': always try the local model; error if unavailable.
 *   - 'lan':       always hit the FastAPI backend.
 *   - 'auto':      try local if a model is loaded or downloaded; else LAN.
 *
 * The caller receives both the reply text and which source produced it,
 * so chat UI can label replies ("via Qwen 3B" / "via laptop").
 */

import { fetchWithAuth, getApiBaseUrl } from '../services/api-client';
import {
  completeLocal,
  getLoadedModelId,
  isLocalLlmAvailable,
  loadLocalModel,
} from './local-llm';
import { getModelById } from './model-catalog';
import { isModelDownloaded } from './model-manager';
import {
  AiSource,
  getAiSource,
  getSelectedModelId,
} from '../services/preferences';
import {
  recallMemories,
  rememberText,
  formatMemoriesForPrompt,
} from './memory-service';
import { analyzeIntent } from './intent';
import { matchCanned } from './canned-replies';

export interface RouteResult {
  ok: boolean;
  source: 'on-device' | 'lan' | 'canned';
  modelId?: string;
  content?: string;
  error?: string;
}

async function tryLan(message: string): Promise<RouteResult> {
  const res = await fetchWithAuth<{ content: string }>('/api/v1/conversations/chat', {
    method: 'POST',
    body: JSON.stringify({ message, stream: false }),
  });
  if (!res.ok || !res.data?.content) {
    const reason =
      res.status === 0
        ? `Can't reach AETHRA server (${getApiBaseUrl()}).`
        : res.error || `Server returned HTTP ${res.status}.`;
    return { ok: false, source: 'lan', error: reason };
  }
  return { ok: true, source: 'lan', content: res.data.content };
}

async function tryLocalWithMessage(
  modelId: string,
  message: string,
): Promise<RouteResult> {
  if (!isLocalLlmAvailable()) {
    return {
      ok: false,
      source: 'on-device',
      error: 'Local AI runtime is not installed on this build.',
    };
  }
  if (!(await isModelDownloaded(modelId))) {
    return {
      ok: false,
      source: 'on-device',
      error: `Model "${modelId}" is not downloaded.`,
    };
  }
  try {
    const memories = await recallMemories(message, { limit: 3, minScore: 0.4 });
    const memoryContext = formatMemoriesForPrompt(memories);
    const content = await completeLocal(modelId, message, undefined, memoryContext);
    // Fire-and-forget write-back so the next turn can retrieve this exchange.
    void rememberText(message, { memoryType: 'conversation' });
    if (content) {
      void rememberText(`Assistant replied: ${content}`, {
        memoryType: 'conversation',
        importance: 0.3,
      });
    }
    return { ok: true, source: 'on-device', modelId, content };
  } catch (err) {
    return {
      ok: false,
      source: 'on-device',
      modelId,
      error: err instanceof Error ? err.message : 'Local inference failed',
    };
  }
}

async function canRunLocal(selectedModelId: string | null): Promise<boolean> {
  if (!selectedModelId) return false;
  if (!getModelById(selectedModelId)) return false;
  if (!isLocalLlmAvailable()) return false;
  return isModelDownloaded(selectedModelId);
}

export async function routeMessage(message: string): Promise<RouteResult> {
  // Short-circuit trivial pleasantries before touching models or network.
  const canned = matchCanned(message);
  if (canned) {
    // Still write to memory so the model sees prior turns on later queries.
    void rememberText(message, { memoryType: 'conversation' });
    void rememberText(`Assistant replied: ${canned.reply}`, {
      memoryType: 'conversation',
      importance: 0.2,
    });
    return { ok: true, source: 'canned', content: canned.reply };
  }

  const source: AiSource = await getAiSource();
  const selectedModelId =
    (await getSelectedModelId()) || getLoadedModelId() || null;

  if (source === 'on-device') {
    if (!selectedModelId) {
      return {
        ok: false,
        source: 'on-device',
        error: 'No on-device model selected. Pick one in Settings → On-device AI.',
      };
    }
    return tryLocalWithMessage(selectedModelId, message);
  }

  if (source === 'lan') {
    return tryLan(message);
  }

  // auto: route by intent
  const localUsable = await canRunLocal(selectedModelId);
  const { hint } = analyzeIntent(message);

  if (hint === 'force-lan') {
    const lan = await tryLan(message);
    if (lan.ok || !localUsable) return lan;
    return tryLocalWithMessage(selectedModelId as string, message);
  }

  if (hint === 'prefer-lan') {
    const lan = await tryLan(message);
    if (lan.ok) return lan;
    if (localUsable) {
      return tryLocalWithMessage(selectedModelId as string, message);
    }
    return lan;
  }

  // 'prefer-local' or 'neutral': local first, LAN fallback
  if (localUsable) {
    const localResult = await tryLocalWithMessage(selectedModelId as string, message);
    if (localResult.ok) return localResult;
    const lanResult = await tryLan(message);
    if (lanResult.ok) return lanResult;
    return localResult;
  }
  return tryLan(message);
}

// Lightweight probe used by Settings to warm up the model.
export async function preloadLocalModel(modelId: string): Promise<void> {
  if (!isLocalLlmAvailable()) return;
  if (!(await isModelDownloaded(modelId))) return;
  await loadLocalModel(modelId);
}
