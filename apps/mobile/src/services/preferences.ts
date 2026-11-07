/**
 * Persistent AETHRA user preferences stored in SecureStore.
 */

import * as SecureStore from 'expo-secure-store';

export type AiSource = 'on-device' | 'lan' | 'auto';

const AI_SOURCE_KEY = 'aethra_ai_source';
const SELECTED_MODEL_KEY = 'aethra_selected_model';
const EMBEDDING_MODEL_KEY = 'aethra_embedding_model';
const STT_MODEL_KEY = 'aethra_stt_model';

async function available(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAiSource(): Promise<AiSource> {
  if (!(await available())) return 'auto';
  try {
    const v = await SecureStore.getItemAsync(AI_SOURCE_KEY);
    if (v === 'on-device' || v === 'lan' || v === 'auto') return v;
  } catch {
    // fall through to default
  }
  return 'auto';
}

export async function setAiSource(source: AiSource): Promise<void> {
  if (!(await available())) return;
  try {
    await SecureStore.setItemAsync(AI_SOURCE_KEY, source);
  } catch {
    // ignore
  }
}

export async function getSelectedModelId(): Promise<string | null> {
  if (!(await available())) return null;
  try {
    return (await SecureStore.getItemAsync(SELECTED_MODEL_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setSelectedModelId(id: string | null): Promise<void> {
  if (!(await available())) return;
  try {
    if (id) await SecureStore.setItemAsync(SELECTED_MODEL_KEY, id);
    else await SecureStore.deleteItemAsync(SELECTED_MODEL_KEY);
  } catch {
    // ignore
  }
}

export async function getEmbeddingModelId(): Promise<string | null> {
  if (!(await available())) return null;
  try {
    return (await SecureStore.getItemAsync(EMBEDDING_MODEL_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setEmbeddingModelId(id: string | null): Promise<void> {
  if (!(await available())) return;
  try {
    if (id) await SecureStore.setItemAsync(EMBEDDING_MODEL_KEY, id);
    else await SecureStore.deleteItemAsync(EMBEDDING_MODEL_KEY);
  } catch {
    // ignore
  }
}

export async function getSttModelId(): Promise<string | null> {
  if (!(await available())) return null;
  try {
    return (await SecureStore.getItemAsync(STT_MODEL_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setSttModelId(id: string | null): Promise<void> {
  if (!(await available())) return;
  try {
    if (id) await SecureStore.setItemAsync(STT_MODEL_KEY, id);
    else await SecureStore.deleteItemAsync(STT_MODEL_KEY);
  } catch {
    // ignore
  }
}
