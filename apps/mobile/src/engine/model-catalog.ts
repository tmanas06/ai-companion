/**
 * Catalog of GGUF models that AETHRA can run on-device via llama.rn.
 *
 * All entries are quantized builds small enough to run on a modern phone.
 * approxRamMb is the peak RAM you should expect during inference at ctxTokens;
 * use it to gate the UI (don't offer models the device can't actually run).
 */

export type ModelKind = 'chat' | 'embedding' | 'stt';

export interface ModelCatalogEntry {
  id: string;
  label: string;
  kind: ModelKind;
  family: 'qwen' | 'phi' | 'gemma' | 'llama' | 'nomic' | 'bge' | 'whisper';
  sizeBytes: number;
  downloadUrl: string;
  sha256?: string;
  ctxTokens: number;
  approxRamMb: number;
  chatTemplate?: 'chatml' | 'phi3' | 'gemma' | 'llama3';
  embeddingDim?: number;
  sttLanguage?: string;
  description: string;
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    label: 'Qwen2.5 3B Instruct (Q4_K_M)',
    kind: 'chat',
    family: 'qwen',
    sizeBytes: 2_019_377_312,
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    ctxTokens: 4096,
    approxRamMb: 2600,
    chatTemplate: 'chatml',
    description:
      'Balanced default. Strong multilingual + instruction following. ~2 GB.',
  },
  {
    id: 'phi-3-mini-4k-instruct-q4',
    label: 'Phi-3 Mini 4K Instruct (Q4)',
    kind: 'chat',
    family: 'phi',
    sizeBytes: 2_393_232_672,
    downloadUrl:
      'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    ctxTokens: 4096,
    approxRamMb: 2800,
    chatTemplate: 'phi3',
    description: 'Stronger reasoning for its size. Best for logic-heavy chat.',
  },
  {
    id: 'gemma-2-2b-it-q4_k_m',
    label: 'Gemma 2 2B Instruct (Q4_K_M)',
    kind: 'chat',
    family: 'gemma',
    sizeBytes: 1_629_000_000,
    downloadUrl:
      'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    ctxTokens: 4096,
    approxRamMb: 2000,
    chatTemplate: 'gemma',
    description: 'Smallest viable model. Pick for 4 GB RAM phones.',
  },
];

MODEL_CATALOG.push({
  id: 'nomic-embed-text-v1.5-q4_k_m',
  label: 'Nomic Embed Text v1.5 (Q4_K_M)',
  kind: 'embedding',
  family: 'nomic',
  sizeBytes: 87_600_000,
  downloadUrl:
    'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
  ctxTokens: 2048,
  approxRamMb: 400,
  embeddingDim: 768,
  description:
    'Embedding model for on-device memory search. 768-dim vectors, ~90 MB.',
});

export function getModelById(id: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function listModels(kind: ModelKind): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((m) => m.kind === kind);
}

MODEL_CATALOG.push(
  {
    id: 'whisper-tiny-en-q5_1',
    label: 'Whisper Tiny English (Q5_1)',
    kind: 'stt',
    family: 'whisper',
    sizeBytes: 32_200_000,
    downloadUrl:
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin',
    ctxTokens: 0,
    approxRamMb: 200,
    sttLanguage: 'en',
    description:
      'Fastest offline speech-to-text. English only. Good for short voice turns (<30s).',
  },
  {
    id: 'whisper-base-en-q5_1',
    label: 'Whisper Base English (Q5_1)',
    kind: 'stt',
    family: 'whisper',
    sizeBytes: 57_400_000,
    downloadUrl:
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    ctxTokens: 0,
    approxRamMb: 350,
    sttLanguage: 'en',
    description:
      'Noticeably more accurate than Tiny. Still fast on modern phones.',
  },
  {
    id: 'whisper-base-multi-q5_1',
    label: 'Whisper Base Multilingual (Q5_1)',
    kind: 'stt',
    family: 'whisper',
    sizeBytes: 57_400_000,
    downloadUrl:
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    ctxTokens: 0,
    approxRamMb: 350,
    sttLanguage: 'multi',
    description:
      '99 languages with auto-detect. Same size as English-only Base.',
  },
  {
    id: 'whisper-small-multi-q5_1',
    label: 'Whisper Small Multilingual (Q5_1)',
    kind: 'stt',
    family: 'whisper',
    sizeBytes: 190_000_000,
    downloadUrl:
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    ctxTokens: 0,
    approxRamMb: 900,
    sttLanguage: 'multi',
    description:
      '99 languages, best quality in the catalog. Needs ~1 GB free RAM.',
  },
);

export const DEFAULT_MODEL_ID = 'qwen2.5-3b-instruct-q4_k_m';
export const DEFAULT_EMBEDDING_MODEL_ID = 'nomic-embed-text-v1.5-q4_k_m';
export const DEFAULT_STT_MODEL_ID = 'whisper-tiny-en-q5_1';
