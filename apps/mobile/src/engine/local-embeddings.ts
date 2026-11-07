/**
 * On-device embedding runtime.
 *
 * Runs a separate llama.rn context initialized with embedding mode so the chat
 * model and the embedding model can coexist without re-loading on every call.
 */

import { getModelById } from './model-catalog';
import { isModelDownloaded, modelFilePath } from './model-manager';

type LlamaContext = {
  embedding?: (text: string) => Promise<{ embedding: number[] }>;
  completion?: (params: Record<string, unknown>) => Promise<{ text: string }>;
  release: () => Promise<void>;
};

type LlamaModule = {
  initLlama: (params: Record<string, unknown>) => Promise<LlamaContext>;
};

let cachedModule: LlamaModule | null | undefined;

function loadModule(): LlamaModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedModule = require('llama.rn') as LlamaModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

let active: { modelId: string; ctx: LlamaContext } | null = null;
let loading: Promise<{ modelId: string; ctx: LlamaContext }> | null = null;

export function isEmbeddingAvailable(): boolean {
  return loadModule() !== null;
}

export async function loadEmbeddingModel(modelId: string): Promise<void> {
  if (active && active.modelId === modelId) return;
  if (loading) {
    await loading;
    return;
  }
  const entry = getModelById(modelId);
  if (!entry || entry.kind !== 'embedding') {
    throw new Error(`Not an embedding model: ${modelId}`);
  }
  if (!(await isModelDownloaded(modelId))) {
    throw new Error(`Embedding model ${modelId} is not downloaded`);
  }
  const mod = loadModule();
  if (!mod) throw new Error('llama.rn not installed');

  loading = (async () => {
    if (active) {
      try {
        await active.ctx.release();
      } catch {
        // ignore
      }
      active = null;
    }
    const ctx = await mod.initLlama({
      model: modelFilePath(modelId),
      n_ctx: entry.ctxTokens,
      embedding: true,
      n_threads: 2,
    });
    const loaded = { modelId, ctx };
    active = loaded;
    loading = null;
    return loaded;
  })();
  try {
    await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

export async function embed(text: string, modelId: string): Promise<number[]> {
  await loadEmbeddingModel(modelId);
  if (!active?.ctx.embedding) {
    throw new Error('Embedding runtime is not ready');
  }
  const result = await active.ctx.embedding(text);
  return result.embedding;
}

export async function embedMany(
  texts: string[],
  modelId: string,
): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embed(t, modelId));
  }
  return out;
}

export async function unloadEmbeddingModel(): Promise<void> {
  if (!active) return;
  try {
    await active.ctx.release();
  } catch {
    // ignore
  }
  active = null;
}
