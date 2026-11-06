import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  isRefreshed?: boolean;
}

function isJwtExpired(token: string, skewSeconds = 30): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(jsonStr);
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

/**
 * Retrieves a valid access token from cookies, or transparently refreshes it using
 * the refresh_token if the access_token cookie is missing or expired.
 */
export async function getOrRefreshAccessToken(request: NextRequest): Promise<AuthTokens | null> {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // If we have a non-expired access token, use it directly
  if (accessToken && !isJwtExpired(accessToken)) {
    return { accessToken, refreshToken };
  }

  // Access token is missing or expired - refresh proactively using refresh_token
  if (refreshToken) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isRefreshed: true,
        };
      }
    } catch (err) {
      console.error('[ServerAuth] Refresh attempt failed:', err);
    }
  }

  // Fallback: if refresh failed but access_token is present, attempt with existing token
  if (accessToken) {
    return { accessToken, refreshToken };
  }

  return null;
}

/**
 * Attaches refreshed auth cookies to the Next.js response.
 */
export function setAuthCookies(response: NextResponse, tokens?: AuthTokens | null): NextResponse {
  if (tokens?.isRefreshed && tokens.accessToken) {
    response.cookies.set('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    if (tokens.refreshToken) {
      response.cookies.set('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
  }
  return response;
}
