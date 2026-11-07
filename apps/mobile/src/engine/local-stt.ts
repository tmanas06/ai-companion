/**
 * On-device speech-to-text via whisper.rn.
 *
 * Record audio with expo-av → transcribe the resulting file locally. Produces
 * plain text that gets fed into routeMessage() like any typed turn.
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { getModelById } from './model-catalog';
import { isModelDownloaded, modelFilePath } from './model-manager';
import { getSttModelId } from '../services/preferences';

type WhisperContext = {
  transcribe: (
    filePath: string,
    options?: Record<string, unknown>,
  ) => { promise: Promise<{ result: string }> };
  release: () => Promise<void>;
};

type WhisperModule = {
  initWhisper: (params: { filePath: string }) => Promise<WhisperContext>;
};

let cachedModule: WhisperModule | null | undefined;

function loadModule(): WhisperModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedModule = require('whisper.rn') as WhisperModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function isSttAvailable(): boolean {
  return loadModule() !== null;
}

let active: { modelId: string; ctx: WhisperContext } | null = null;

async function ensureModel(modelId: string): Promise<WhisperContext> {
  if (active && active.modelId === modelId) return active.ctx;
  const mod = loadModule();
  if (!mod) throw new Error('whisper.rn not installed');
  const entry = getModelById(modelId);
  if (!entry || entry.kind !== 'stt') {
    throw new Error(`Not an STT model: ${modelId}`);
  }
  if (!(await isModelDownloaded(modelId))) {
    throw new Error(`STT model ${modelId} is not downloaded`);
  }
  if (active) {
    try {
      await active.ctx.release();
    } catch {
      // ignore
    }
    active = null;
  }
  const ctx = await mod.initWhisper({ filePath: modelFilePath(modelId) });
  active = { modelId, ctx };
  return ctx;
}

export async function transcribeFile(audioUri: string): Promise<string> {
  const modelId = await getSttModelId();
  if (!modelId) throw new Error('No STT model selected');
  const entry = getModelById(modelId);
  const ctx = await ensureModel(modelId);
  const localPath = audioUri.replace(/^file:\/\//, '');
  // 'auto' lets whisper detect the language; English-only models ignore this.
  const language = entry?.sttLanguage === 'multi' ? 'auto' : (entry?.sttLanguage ?? 'en');
  const task = ctx.transcribe(localPath, {
    language,
    maxThreads: 2,
    translate: false,
  });
  const { result } = await task.promise;
  return result.trim();
}

export async function unloadStt(): Promise<void> {
  if (!active) return;
  try {
    await active.ctx.release();
  } catch {
    // ignore
  }
  active = null;
}

/**
 * Minimal recording session. Caller holds the returned handle, then calls
 * stopAndTranscribe() or cancel().
 */
export interface RecordingSession {
  stopAndTranscribe: () => Promise<string>;
  cancel: () => Promise<void>;
}

export async function startRecording(): Promise<RecordingSession> {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Microphone permission denied');
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  // Mono 16kHz WAV — matches whisper.cpp's native input format, no resampling.
  await recording.prepareToRecordAsync({
    android: {
      extension: '.wav',
      outputFormat: Audio.AndroidOutputFormat.DEFAULT,
      audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  });
  await recording.startAsync();

  const stopAndTranscribe = async (): Promise<string> => {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // Already stopped; proceed to transcription anyway.
    }
    const uri = recording.getURI();
    if (!uri) throw new Error('Recording produced no file');
    try {
      return await transcribeFile(uri);
    } finally {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // ignore
      }
    }
  };

  const cancel = async (): Promise<void> => {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    const uri = recording.getURI();
    if (uri) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // ignore
      }
    }
  };

  return { stopAndTranscribe, cancel };
}
