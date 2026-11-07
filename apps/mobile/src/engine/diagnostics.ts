/**
 * Lightweight in-app diagnostics for the on-device runtime.
 * Each benchmark fails-soft and returns a BenchmarkResult the UI can render.
 */

import { completeLocal, isLocalLlmAvailable } from './local-llm';
import { embed, isEmbeddingAvailable } from './local-embeddings';
import { isSttAvailable } from './local-stt';
import { isModelDownloaded } from './model-manager';
import {
  getSelectedModelId,
  getEmbeddingModelId,
  getSttModelId,
} from '../services/preferences';
import { countMemories } from './memory-store';
import { getDeviceRamMb } from './device-caps';

export interface BenchmarkResult {
  ok: boolean;
  label: string;
  detail: string;
  latencyMs?: number;
  throughput?: string;
}

const BENCH_PROMPT =
  'Introduce yourself as AETHRA in one sentence. Keep it under 20 words.';

export async function benchmarkChat(): Promise<BenchmarkResult> {
  const label = 'Chat (local LLM)';
  if (!isLocalLlmAvailable()) {
    return { ok: false, label, detail: 'llama.rn not installed' };
  }
  const modelId = await getSelectedModelId();
  if (!modelId || !(await isModelDownloaded(modelId))) {
    return { ok: false, label, detail: 'Chat model not downloaded' };
  }
  const start = Date.now();
  try {
    const text = await completeLocal(modelId, BENCH_PROMPT);
    const ms = Date.now() - start;
    const words = text.split(/\s+/).filter(Boolean).length;
    const wps = words > 0 ? (words / (ms / 1000)).toFixed(1) : '0';
    return {
      ok: true,
      label,
      detail: `${words} words in ${(ms / 1000).toFixed(2)}s`,
      latencyMs: ms,
      throughput: `~${wps} wps`,
    };
  } catch (err) {
    return {
      ok: false,
      label,
      detail: err instanceof Error ? err.message : 'inference failed',
    };
  }
}

export async function benchmarkEmbedding(): Promise<BenchmarkResult> {
  const label = 'Embedding';
  if (!isEmbeddingAvailable()) {
    return { ok: false, label, detail: 'llama.rn not installed' };
  }
  const modelId = await getEmbeddingModelId();
  if (!modelId || !(await isModelDownloaded(modelId))) {
    return { ok: false, label, detail: 'Embedding model not downloaded' };
  }
  const start = Date.now();
  try {
    const v = await embed('The quick brown fox jumps over the lazy dog.', modelId);
    const ms = Date.now() - start;
    return {
      ok: true,
      label,
      detail: `${v.length}-dim vector`,
      latencyMs: ms,
    };
  } catch (err) {
    return {
      ok: false,
      label,
      detail: err instanceof Error ? err.message : 'embed failed',
    };
  }
}

export async function snapshotSystem(): Promise<{
  ramMb: number | null;
  memories: number;
  llm: boolean;
  stt: boolean;
  embeddingModel: string | null;
  sttModel: string | null;
  chatModel: string | null;
}> {
  const [memories, chatModel, embeddingModel, sttModel] = await Promise.all([
    countMemories().catch(() => 0),
    getSelectedModelId(),
    getEmbeddingModelId(),
    getSttModelId(),
  ]);
  return {
    ramMb: getDeviceRamMb(),
    memories,
    llm: isLocalLlmAvailable(),
    stt: isSttAvailable(),
    embeddingModel,
    sttModel,
    chatModel,
  };
}
