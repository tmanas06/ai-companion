import {
  getActiveAvatar,
  saveAvatar,
  getCachedAvatar,
  setCachedAvatar,
  clearAvatarCache,
  clearAllAvatarData,
} from '../avatar-service';
import * as apiClient from '../api-client';
import * as modelCacheManager from '../model-cache-manager';
import { DEFAULT_AVATAR_3D_CONFIG } from '@ai-companion/shared';

jest.mock('../api-client');
jest.mock('../model-cache-manager');

describe('avatar-service', () => {
  const mockedFetchWithAuth = apiClient.fetchWithAuth as jest.MockedFunction<
    typeof apiClient.fetchWithAuth
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAvatarCache();
  });

  describe('getActiveAvatar', () => {
    it('returns active avatar and updates cache on 200 OK', async () => {
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: 'avatar-uuid-1',
          name: 'My Aria',
          config: {
            ...DEFAULT_AVATAR_3D_CONFIG,
            face: {
              ...DEFAULT_AVATAR_3D_CONFIG.face,
              jawWidth: 0.75,
            },
          },
          is_active: true,
        },
      });

      const res = await getActiveAvatar();
      expect(res.error).toBeUndefined();
      expect(res.avatar).toBeDefined();
      expect(res.avatar?.id).toBe('avatar-uuid-1');
      expect(res.avatar?.name).toBe('My Aria');
      expect(res.avatar?.config.face.jawWidth).toBe(0.75);

      // Verify cached
      expect(getCachedAvatar()?.id).toBe('avatar-uuid-1');
      expect(mockedFetchWithAuth).toHaveBeenCalledWith('/api/v1/avatars/active', {
        method: 'GET',
      });
    });

    it('returns null and clears cache on 404 Not Found (graceful fallback)', async () => {
      setCachedAvatar({
        id: 'old-avatar',
        name: 'Old',
        config: DEFAULT_AVATAR_3D_CONFIG,
        isActive: true,
      });

      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: false,
        status: 404,
        data: null,
        error: 'Not found',
      });

      const res = await getActiveAvatar();
      expect(res.avatar).toBeNull();
      expect(getCachedAvatar()).toBeNull();
    });

    it('returns cached avatar and error message on network failure', async () => {
      const existing = {
        id: 'cached-id',
        name: 'Cached Aria',
        config: DEFAULT_AVATAR_3D_CONFIG,
        isActive: true,
      };
      setCachedAvatar(existing);

      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: false,
        status: 0,
        data: null,
        error: 'Network connection refused',
      });

      const res = await getActiveAvatar();
      expect(res.avatar).toEqual(existing);
      expect(res.error).toBe('Network connection refused');
    });
  });

  describe('saveAvatar', () => {
    it('creates new avatar via POST when no avatarId is provided', async () => {
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          id: 'new-avatar-id',
          name: 'New Custom Aria',
          config: DEFAULT_AVATAR_3D_CONFIG,
          is_active: true,
        },
      });

      const res = await saveAvatar('New Custom Aria', DEFAULT_AVATAR_3D_CONFIG);
      expect(res.avatar?.id).toBe('new-avatar-id');
      expect(res.avatar?.name).toBe('New Custom Aria');
      expect(mockedFetchWithAuth).toHaveBeenCalledWith(
        '/api/v1/avatars',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('updates existing avatar via PATCH when avatarId is provided', async () => {
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: 'existing-id',
          name: 'Updated Aria',
          config: DEFAULT_AVATAR_3D_CONFIG,
          is_active: true,
        },
      });

      const res = await saveAvatar(
        'Updated Aria',
        DEFAULT_AVATAR_3D_CONFIG,
        'existing-id'
      );
      expect(res.avatar?.id).toBe('existing-id');
      expect(mockedFetchWithAuth).toHaveBeenCalledWith(
        '/api/v1/avatars/existing-id',
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });
  });

  describe('clearAvatarCache and clearAllAvatarData', () => {
    it('prevents retaining previous user avatar across account logout', () => {
      setCachedAvatar({
        id: 'user-a-avatar',
        name: 'User A Companion',
        config: DEFAULT_AVATAR_3D_CONFIG,
        isActive: true,
      });
      expect(getCachedAvatar()?.id).toBe('user-a-avatar');

      clearAvatarCache();
      expect(getCachedAvatar()).toBeNull();
    });

    it('clears both in-memory cache and invokes disk cache cleanup when requested', async () => {
      setCachedAvatar({
        id: 'user-a-avatar',
        name: 'User A Companion',
        config: DEFAULT_AVATAR_3D_CONFIG,
        isActive: true,
      });

      await clearAllAvatarData(true);
      expect(getCachedAvatar()).toBeNull();
      expect(modelCacheManager.clearModelCache).toHaveBeenCalledTimes(1);
    });

    it('ensures account switching isolates avatar configurations between users', async () => {
      // User A session
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: 'user-a-avatar',
          name: 'Aria User A',
          config: DEFAULT_AVATAR_3D_CONFIG,
          is_active: true,
        },
      });

      const userARes = await getActiveAvatar();
      expect(userARes.avatar?.id).toBe('user-a-avatar');
      expect(getCachedAvatar()?.id).toBe('user-a-avatar');

      // Logout User A
      await clearAllAvatarData(true);
      expect(getCachedAvatar()).toBeNull();

      // User B logs in
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: 'user-b-avatar',
          name: 'Marcus User B',
          config: {
            ...DEFAULT_AVATAR_3D_CONFIG,
            baseModelId: 'marcus_photorealistic',
          },
          is_active: true,
        },
      });

      const userBRes = await getActiveAvatar();
      expect(userBRes.avatar?.id).toBe('user-b-avatar');
      expect(userBRes.avatar?.config.baseModelId).toBe('marcus_photorealistic');
      expect(getCachedAvatar()?.id).toBe('user-b-avatar');
    });

    it('handles expired authentication (401) without crashing avatar loader', async () => {
      mockedFetchWithAuth.mockResolvedValueOnce({
        ok: false,
        status: 401,
        data: null,
        error: 'Token has expired',
      });

      const res = await getActiveAvatar();
      expect(res.avatar).toBeNull();
      expect(res.error).toBe('Token has expired');
    });
  });
});
