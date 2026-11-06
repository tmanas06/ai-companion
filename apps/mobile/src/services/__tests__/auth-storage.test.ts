import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  setTokens,
  clearTokens,
} from '../auth-storage';

describe('auth-storage', () => {
  beforeEach(async () => {
    await clearTokens();
  });

  it('stores and retrieves access token', async () => {
    expect(await getAccessToken()).toBeNull();
    await setAccessToken('test-access-token-123');
    expect(await getAccessToken()).toBe('test-access-token-123');
  });

  it('stores and retrieves refresh token', async () => {
    expect(await getRefreshToken()).toBeNull();
    await setRefreshToken('test-refresh-token-456');
    expect(await getRefreshToken()).toBe('test-refresh-token-456');
  });

  it('stores both access and refresh tokens using setTokens', async () => {
    await setTokens('access-abc', 'refresh-xyz');
    expect(await getAccessToken()).toBe('access-abc');
    expect(await getRefreshToken()).toBe('refresh-xyz');
  });

  it('clears all tokens cleanly', async () => {
    await setTokens('token-to-delete', 'refresh-to-delete');
    expect(await getAccessToken()).toBe('token-to-delete');

    await clearTokens();
    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });
});
