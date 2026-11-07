/**
 * Downloads, stores, and manages GGUF model files on the device.
 *
 * Models are stored under <documentDirectory>/aethra-models/<id>.gguf.
 * Downloads are resumable via expo-file-system's createDownloadResumable.
 */

import * as FileSystem from 'expo-file-system';
import { getModelById, ModelCatalogEntry } from './model-catalog';

const MODELS_DIR = `${FileSystem.documentDirectory}aethra-models/`;

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  fraction: number;
}

export type DownloadHandle = {
  cancel: () => Promise<void>;
  promise: Promise<string>;
};

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  }
}

export function modelFilePath(id: string): string {
  return `${MODELS_DIR}${id}.gguf`;
}

export async function isModelDownloaded(id: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(modelFilePath(id));
  if (!info.exists) return false;
  const entry = getModelById(id);
  if (!entry) return info.exists;
  // Consider it complete only if the size is within 1 MB of expected.
  const size = 'size' in info ? info.size : 0;
  return Math.abs(size - entry.sizeBytes) < 1_048_576;
}

export async function deleteModel(id: string): Promise<void> {
  const path = modelFilePath(id);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

export async function listDownloadedModels(): Promise<string[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(MODELS_DIR);
  return files
    .filter((f) => f.endsWith('.gguf'))
    .map((f) => f.replace(/\.gguf$/, ''));
}

export function downloadModel(
  entry: ModelCatalogEntry,
  onProgress?: (p: DownloadProgress) => void,
): DownloadHandle {
  const dest = modelFilePath(entry.id);

  let resumable: FileSystem.DownloadResumable | null = null;

  const promise = (async () => {
    await ensureDir();
    resumable = FileSystem.createDownloadResumable(
      entry.downloadUrl,
      dest,
      {},
      (d) => {
        const total = d.totalBytesExpectedToWrite || entry.sizeBytes;
        onProgress?.({
          totalBytesWritten: d.totalBytesWritten,
          totalBytesExpectedToWrite: total,
          fraction: total > 0 ? d.totalBytesWritten / total : 0,
        });
      },
    );
    const result = await resumable.downloadAsync();
    if (!result?.uri) {
      throw new Error('Download produced no file');
    }
    return result.uri;
  })();

  return {
    promise,
    cancel: async () => {
      try {
        if (resumable) await resumable.pauseAsync();
      } catch {
        // ignore
      }
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch {
        // ignore
      }
    },
  };
}
