/**
 * First-run model auto-downloader.
 *
 * On app mount, checks the three default model slots (chat / embedding / STT)
 * and downloads whatever is missing in sequence. Picks the chat model that
 * fits the device's RAM (Qwen 3B for flagships, Gemma 2B for budget phones).
 *
 * Progress is exposed via useAutoDownload() and rendered in the root layout
 * as a persistent banner. Downloads continue in the background as the user
 * navigates tabs because the hook lives in the root layout, not individual
 * screens.
 */

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_STT_MODEL_ID,
  getModelById,
  ModelCatalogEntry,
} from '../engine/model-catalog';
import {
  downloadModel,
  DownloadHandle,
  isModelDownloaded,
} from '../engine/model-manager';
import { recommendModelId } from '../engine/device-caps';
import {
  getSelectedModelId,
  setSelectedModelId,
  getEmbeddingModelId,
  setEmbeddingModelId,
  getSttModelId,
  setSttModelId,
} from './preferences';

export type AutoDownloadPhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'done'
  | 'error';

export interface AutoDownloadStatus {
  phase: AutoDownloadPhase;
  currentModel: ModelCatalogEntry | null;
  fraction: number;
  totalModels: number;
  completedModels: number;
  error: string | null;
}

async function resolveDefaultIds() {
  const chat =
    (await getSelectedModelId()) ||
    recommendModelId('chat') ||
    'qwen2.5-3b-instruct-q4_k_m';
  const embed = (await getEmbeddingModelId()) || DEFAULT_EMBEDDING_MODEL_ID;
  const stt = (await getSttModelId()) || DEFAULT_STT_MODEL_ID;
  return { chat, embed, stt };
}

async function persistSelection(entry: ModelCatalogEntry) {
  if (entry.kind === 'chat') await setSelectedModelId(entry.id);
  else if (entry.kind === 'embedding') await setEmbeddingModelId(entry.id);
  else if (entry.kind === 'stt') await setSttModelId(entry.id);
}

export function useAutoDownload(): AutoDownloadStatus & {
  cancel: () => void;
  retry: () => void;
} {
  const [status, setStatus] = useState<AutoDownloadStatus>({
    phase: 'idle',
    currentModel: null,
    fraction: 0,
    totalModels: 0,
    completedModels: 0,
    error: null,
  });
  const handleRef = useRef<DownloadHandle | null>(null);
  const cancelledRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      setStatus((s) => ({ ...s, phase: 'checking', error: null }));
      const ids = await resolveDefaultIds();
      const want = [ids.chat, ids.embed, ids.stt]
        .map(getModelById)
        .filter((e): e is ModelCatalogEntry => !!e);

      // Which ones need downloading?
      const missing: ModelCatalogEntry[] = [];
      for (const e of want) {
        if (!(await isModelDownloaded(e.id))) missing.push(e);
        else await persistSelection(e); // ensure preference is saved
      }

      if (missing.length === 0) {
        setStatus((s) => ({
          ...s,
          phase: 'done',
          currentModel: null,
          totalModels: want.length,
          completedModels: want.length,
        }));
        return;
      }

      setStatus((s) => ({
        ...s,
        phase: 'downloading',
        totalModels: missing.length,
        completedModels: 0,
      }));

      for (let i = 0; i < missing.length; i++) {
        if (cancelledRef.current) break;
        const entry = missing[i];
        setStatus((s) => ({
          ...s,
          currentModel: entry,
          fraction: 0,
          completedModels: i,
        }));
        try {
          const handle = downloadModel(entry, (p) => {
            if (cancelledRef.current) return;
            setStatus((s) => ({ ...s, fraction: p.fraction }));
          });
          handleRef.current = handle;
          await handle.promise;
          await persistSelection(entry);
        } catch (err) {
          if (cancelledRef.current) break;
          setStatus((s) => ({
            ...s,
            phase: 'error',
            error:
              err instanceof Error
                ? `${entry.label}: ${err.message}`
                : `${entry.label}: download failed`,
          }));
          return;
        }
      }
      handleRef.current = null;
      if (!cancelledRef.current) {
        setStatus((s) => ({
          ...s,
          phase: 'done',
          currentModel: null,
          fraction: 1,
          completedModels: s.totalModels,
        }));
      }
    })();

    return () => {
      cancelledRef.current = true;
      handleRef.current?.cancel().catch(() => {});
      handleRef.current = null;
    };
  }, [attempt]);

  return {
    ...status,
    cancel: () => {
      cancelledRef.current = true;
      handleRef.current?.cancel().catch(() => {});
      handleRef.current = null;
      setStatus((s) => ({ ...s, phase: 'idle', currentModel: null }));
    },
    retry: () => setAttempt((n) => n + 1),
  };
}
