/**
 * On-device LLM runtime (llama.rn wrapper).
 *
 * llama.rn is a native module — it only exists after an `expo prebuild` + native
 * rebuild (dev client or EAS APK). This module loads it dynamically so the JS
 * build succeeds even when the native binding isn't installed yet; consumers
 * check `isLocalLlmAvailable()` before using it.
 */

import { getModelById, ModelCatalogEntry } from './model-catalog';
import { isModelDownloaded, modelFilePath } from './model-manager';

type LlamaContext = {
  completion: (params: Record<string, unknown>) => Promise<{ text: string }>;
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

export function isLocalLlmAvailable(): boolean {
  return loadModule() !== null;
}

type LoadedModel = {
  modelId: string;
  ctx: LlamaContext;
};

let active: LoadedModel | null = null;
let loading: Promise<LoadedModel> | null = null;

export async function loadLocalModel(modelId: string): Promise<LoadedModel> {
  if (active && active.modelId === modelId) return active;
  if (loading) return loading;

  const entry = getModelById(modelId);
  if (!entry) throw new Error(`Unknown model: ${modelId}`);
  if (!(await isModelDownloaded(modelId))) {
    throw new Error(`Model ${modelId} is not downloaded`);
  }
  const mod = loadModule();
  if (!mod) {
    throw new Error(
      'Local LLM runtime (llama.rn) is not installed. Rebuild the APK with a dev client.',
    );
  }

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
      n_batch: 512,
      n_threads: 4,
      use_mlock: false,
    });
    const loaded = { modelId, ctx };
    active = loaded;
    loading = null;
    return loaded;
  })();

  try {
    return await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

export async function unloadLocalModel(): Promise<void> {
  if (!active) return;
  try {
    await active.ctx.release();
  } catch {
    // ignore
  }
  active = null;
}

export function getLoadedModelId(): string | null {
  return active?.modelId ?? null;
}

function buildPrompt(entry: ModelCatalogEntry, userMessage: string, systemPrompt: string): string {
  switch (entry.chatTemplate) {
    case 'chatml':
      return (
        `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
        `<|im_start|>user\n${userMessage}<|im_end|>\n` +
        `<|im_start|>assistant\n`
      );
    case 'phi3':
      return (
        `<|system|>\n${systemPrompt}<|end|>\n` +
        `<|user|>\n${userMessage}<|end|>\n` +
        `<|assistant|>\n`
      );
    case 'gemma':
      return (
        `<start_of_turn>user\n${systemPrompt}\n\n${userMessage}<end_of_turn>\n` +
        `<start_of_turn>model\n`
      );
    case 'llama3':
      return (
        `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>` +
        `<|start_header_id|>user<|end_header_id|>\n\n${userMessage}<|eot_id|>` +
        `<|start_header_id|>assistant<|end_header_id|>\n\n`
      );
  }
}

export async function completeLocal(
  modelId: string,
  userMessage: string,
  systemPrompt: string = 'You are AETHRA, a warm and concise AI companion.',
  extraSystem: string = '',
): Promise<string> {
  const entry = getModelById(modelId);
  if (!entry) throw new Error(`Unknown model: ${modelId}`);
  const { ctx } = await loadLocalModel(modelId);
  const fullSystem = extraSystem ? `${systemPrompt}${extraSystem}` : systemPrompt;
  const prompt = buildPrompt(entry, userMessage, fullSystem);

  const result = await ctx.completion({
    prompt,
    n_predict: 256,
    temperature: 0.7,
    top_p: 0.9,
    stop: ['<|im_end|>', '<|end|>', '<end_of_turn>', '<|eot_id|>', '</s>'],
  });

  return result.text.trim();
}
