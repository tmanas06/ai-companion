import {
  getCachedModelUri,
  clearModelCache,
  getModelCacheStats,
  validateGlbHeader,
} from '../model-cache-manager';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/user/0/app/files/',
  cacheDirectory: 'file:///data/user/0/app/cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  downloadAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

describe('model-cache-manager', () => {
  const mockedFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(headers: Record<string, string>, ok = true) {
    return {
      ok,
      status: ok ? 200 : 404,
      headers: {
        get: (key: string) => {
          const lower = key.toLowerCase();
          for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === lower) {
              return headers[k];
            }
          }
          return null;
        },
      },
    };
  }

  it('downloads and stores model when cache is empty', async () => {
    // getInfoAsync for cache directory
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    // getInfoAsync for local target file (missing)
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
    } as any);

    // HEAD request
    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse({
        etag: '"etag-12345"',
        'content-length': '12037772',
      }) as any
    );

    // downloadAsync
    mockedFileSystem.downloadAsync.mockResolvedValueOnce({
      status: 200,
      uri: 'file:///data/user/0/app/files/avatar_models/aria_v2.glb.tmp',
      headers: { etag: '"etag-12345"' },
    } as any);

    mockedFileSystem.moveAsync.mockResolvedValueOnce(undefined as any);
    mockedFileSystem.writeAsStringAsync.mockResolvedValueOnce(undefined as any);

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(false);
    expect(res.uri).toContain('aria_v2.glb');
    expect(mockedFileSystem.downloadAsync).toHaveBeenCalledTimes(1);
    expect(mockedFileSystem.moveAsync).toHaveBeenCalledTimes(1);
    expect(mockedFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });

  it('returns cached file directly on cache hit when ETag matches', async () => {
    // getInfoAsync for cache directory
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    // getInfoAsync for local target file (exists!)
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      size: 12037772,
    } as any);

    // getInfoAsync for meta file (exists!)
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
    } as any);

    // readAsStringAsync for meta file
    mockedFileSystem.readAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({
        url: 'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
        etag: '"etag-matching-999"',
        contentLength: 12037772,
        cachedAt: Date.now(),
      })
    );

    // HEAD request returns same ETag
    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse({
        etag: '"etag-matching-999"',
        'content-length': '12037772',
      }) as any
    );

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(true);
    expect(res.uri).toContain('aria_v2.glb');
    expect(mockedFileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('falls back to local cache when network is offline', async () => {
    // cache dir exists
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    // local file exists
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      size: 12037772,
    } as any);

    // meta exists
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
    } as any);

    mockedFileSystem.readAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({
        url: 'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
        etag: '"any-etag"',
        contentLength: 12037772,
        cachedAt: Date.now(),
      })
    );

    // Network request throws offline error
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network offline'));

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(true);
    expect(res.uri).toContain('aria_v2.glb');
  });

  it('clears model cache directory cleanly', async () => {
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    mockedFileSystem.deleteAsync.mockResolvedValueOnce(undefined as any);

    await clearModelCache();
    expect(mockedFileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('avatar_models/'),
      { idempotent: true }
    );
  });

  it('computes model cache stats for existing cached files', async () => {
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    mockedFileSystem.readDirectoryAsync.mockResolvedValueOnce([
      'aria_v2.glb',
      'aria_v2.glb.meta.json',
      'marcus_v2.glb',
    ] as any);

    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      size: 12000000,
    } as any);
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      size: 500,
    } as any);
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      size: 11000000,
    } as any);

    const stats = await getModelCacheStats();
    expect(stats.cachedCount).toBe(2);
    expect(stats.totalSizeBytes).toBe(23000500);
  });

  it('validates glTF binary header', async () => {
    mockedFileSystem.readAsStringAsync.mockResolvedValueOnce('Z2xURg==');

    const isValid = await validateGlbHeader('file:///data/user/0/app/files/avatar_models/aria_v2.glb');
    expect(isValid).toBe(true);
  });

  it('returns false for corrupt GLB header', async () => {
    mockedFileSystem.readAsStringAsync.mockResolvedValueOnce('QkFEIQ==');

    const isValid = await validateGlbHeader('file:///data/user/0/app/files/avatar_models/corrupt.glb');
    expect(isValid).toBe(false);
  });

  it('handles interrupted download (HTTP 500) and deletes temp file', async () => {
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
    } as any);

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse({
        etag: '"etag-500"',
        'content-length': '12000000',
      }) as any
    );

    mockedFileSystem.downloadAsync.mockResolvedValueOnce({
      status: 500,
      uri: 'file:///data/user/0/app/files/avatar_models/aria_v2.glb.tmp',
      headers: {},
    } as any);

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(false);
    expect(res.error).toContain('500');
    expect(mockedFileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      { idempotent: true }
    );
  });

  it('re-downloads model when remote ETag changes', async () => {
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      size: 12037772,
    } as any);

    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
    } as any);

    mockedFileSystem.readAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({
        url: 'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
        etag: '"old-etag-v1"',
        contentLength: 12037772,
        cachedAt: Date.now() - 86400000,
      })
    );

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse({
        etag: '"new-etag-v2"',
        'content-length': '12037772',
      }) as any
    );

    mockedFileSystem.downloadAsync.mockResolvedValueOnce({
      status: 200,
      uri: 'file:///data/user/0/app/files/avatar_models/aria_v2.glb.tmp',
      headers: { etag: '"new-etag-v2"' },
    } as any);

    mockedFileSystem.moveAsync.mockResolvedValueOnce(undefined as any);
    mockedFileSystem.writeAsStringAsync.mockResolvedValueOnce(undefined as any);

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(false);
    expect(mockedFileSystem.downloadAsync).toHaveBeenCalledTimes(1);
    expect(mockedFileSystem.moveAsync).toHaveBeenCalledTimes(1);
  });

  it('handles failed cache write (insufficient disk storage) gracefully', async () => {
    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
    } as any);

    mockedFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
    } as any);

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse({
        etag: '"etag-enospc"',
        'content-length': '12000000',
      }) as any
    );

    mockedFileSystem.downloadAsync.mockResolvedValueOnce({
      status: 200,
      uri: 'file:///data/user/0/app/files/avatar_models/aria_v2.glb.tmp',
      headers: { etag: '"etag-enospc"' },
    } as any);

    mockedFileSystem.moveAsync.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

    const res = await getCachedModelUri(
      'http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb',
      'aria'
    );

    expect(res.fromCache).toBe(false);
    expect(res.error).toContain('ENOSPC');
    expect(res.uri).toBe('http://10.0.2.2:8000/models/aria_photorealistic_mobile.glb');
  });
});
