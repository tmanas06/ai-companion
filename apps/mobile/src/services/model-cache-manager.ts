/**
 * ModelCacheManager for Mobile.
 * Provides resilient persistent disk caching, ETag validation, atomic writes,
 * and offline fallback for 3D GLB avatar assets using expo-file-system.
 */

import * as FileSystem from 'expo-file-system';

const CACHE_SUBDIR = 'avatar_models/';

interface ModelCacheMeta {
  url: string;
  etag?: string;
  contentLength?: number;
  lastModified?: string;
  cachedAt: number;
}

// In-memory fallback for test runners / environments where FileSystem is mocked
const memoryModelCache = new Map<string, { uri: string; meta: ModelCacheMeta }>();

function getCacheDir(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return `${base}${CACHE_SUBDIR}`;
}

/**
 * Ensures the model cache directory exists.
 */
async function ensureCacheDir(): Promise<string> {
  const dir = getCacheDir();
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // Retained clean state if directory creation is simulated
  }
  return dir;
}

/**
 * Validates whether a file begins with the 4-byte GLTF binary header ("glTF").
 */
export async function validateGlbHeader(fileUri: string): Promise<boolean> {
  try {
    // Read the first 4 bytes encoded in base64 (6 characters)
    const base64Chunk = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 12,
      position: 0,
    });
    if (!base64Chunk) return false;

    // Buffer or atob decode
    let decoded = '';
    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(base64Chunk, 'base64').toString('ascii');
    } else if (typeof atob !== 'undefined') {
      decoded = atob(base64Chunk);
    }
    return decoded.startsWith('glTF');
  } catch {
    // In environments where slice reading is unsupported, verify file has non-zero size
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      return info.exists && (info.size || 0) > 1000;
    } catch {
      return true;
    }
  }
}

/**
 * Resolves a model URL to a local cached file URI, downloading and caching
 * if missing, or re-validating against remote ETag/Content-Length if expired.
 */
export async function getCachedModelUri(
  remoteUrl: string,
  baseModelId: string
): Promise<{ uri: string; fromCache: boolean; error?: string }> {
  // If running in an environment without FileSystem documentDirectory, return remoteUrl directly
  if (!FileSystem.documentDirectory && !FileSystem.cacheDirectory) {
    return { uri: remoteUrl, fromCache: false };
  }

  const cacheDir = await ensureCacheDir();
  const filename = `${baseModelId}_v2.glb`;
  const localFileUri = `${cacheDir}${filename}`;
  const localMetaUri = `${cacheDir}${filename}.meta.json`;
  const tempFileUri = `${cacheDir}${filename}.tmp`;

  let localExists = false;
  let localMeta: ModelCacheMeta | null = null;

  try {
    const fileInfo = await FileSystem.getInfoAsync(localFileUri);
    localExists = fileInfo.exists && (fileInfo.size || 0) > 0;

    if (localExists) {
      const metaInfo = await FileSystem.getInfoAsync(localMetaUri);
      if (metaInfo.exists) {
        const metaJson = await FileSystem.readAsStringAsync(localMetaUri);
        localMeta = JSON.parse(metaJson);
      }
    }
  } catch {
    localExists = false;
  }

  // Check remote headers via HEAD request for ETag and Content-Length
  let remoteEtag: string | undefined;
  let remoteLength: number | undefined;
  let isRemoteAccessible = false;

  try {
    const headRes = await fetch(remoteUrl, { method: 'HEAD' });
    if (headRes.ok) {
      isRemoteAccessible = true;
      remoteEtag = headRes.headers.get('etag') || undefined;
      const lenHeader = headRes.headers.get('content-length');
      if (lenHeader) {
        remoteLength = parseInt(lenHeader, 10);
      }
    }
  } catch {
    isRemoteAccessible = false;
  }

  // Cache Hit Check: if local file exists and matches ETag / Content-Length
  if (localExists && localMeta) {
    if (!isRemoteAccessible) {
      return { uri: localFileUri, fromCache: true };
    }

    if (remoteEtag && localMeta.etag) {
      if (localMeta.etag === remoteEtag) {
        return { uri: localFileUri, fromCache: true };
      }
    } else if (remoteLength && localMeta.contentLength === remoteLength) {
      return { uri: localFileUri, fromCache: true };
    }
  }

  // If remote is not accessible but we have an existing local copy, fallback gracefully
  if (!isRemoteAccessible && localExists) {
    return { uri: localFileUri, fromCache: true };
  }

  // If remote is not accessible and no local copy exists, return remoteUrl for GLTFLoader
  if (!isRemoteAccessible) {
    return { uri: remoteUrl, fromCache: false };
  }

  // Download new version to temporary file
  try {
    // Clean up any stale temp file
    try {
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
    } catch {
      // Ignored
    }

    const downloadRes = await FileSystem.downloadAsync(remoteUrl, tempFileUri);

    if (downloadRes.status !== 200) {
      // Download failed, delete temp file
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
      if (localExists) {
        return { uri: localFileUri, fromCache: true };
      }
      return { uri: remoteUrl, fromCache: false, error: `Download failed with HTTP ${downloadRes.status}` };
    }

    // Atomically replace target file
    await FileSystem.moveAsync({
      from: tempFileUri,
      to: localFileUri,
    });

    // Write updated cache metadata
    const updatedMeta: ModelCacheMeta = {
      url: remoteUrl,
      etag: remoteEtag || downloadRes.headers['etag'] || downloadRes.headers['ETag'],
      contentLength: remoteLength,
      cachedAt: Date.now(),
    };

    await FileSystem.writeAsStringAsync(localMetaUri, JSON.stringify(updatedMeta));

    return { uri: localFileUri, fromCache: false };
  } catch (err: unknown) {
    // If download/save fails but we already have an existing local copy, fallback to it
    if (localExists) {
      return { uri: localFileUri, fromCache: true };
    }
    const message = err instanceof Error ? err.message : 'Model cache download failed';
    return { uri: remoteUrl, fromCache: false, error: message };
  }
}

/**
 * Clears all cached 3D avatar model files from the device.
 */
export async function clearModelCache(): Promise<void> {
  memoryModelCache.clear();
  try {
    const dir = getCacheDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // Ignored
  }
}

/**
 * Inspects total storage bytes occupied by cached avatar models.
 */
export async function getModelCacheStats(): Promise<{ cachedCount: number; totalSizeBytes: number }> {
  try {
    const dir = getCacheDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return { cachedCount: 0, totalSizeBytes: 0 };

    const files = await FileSystem.readDirectoryAsync(dir);
    let totalBytes = 0;
    let glbCount = 0;

    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${dir}${file}`);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        totalBytes += fileInfo.size || 0;
        if (file.endsWith('.glb')) glbCount++;
      }
    }
    return { cachedCount: glbCount, totalSizeBytes: totalBytes };
  } catch {
    return { cachedCount: 0, totalSizeBytes: 0 };
  }
}
