import { NextRequest, NextResponse } from 'next/server';
import { getOrRefreshAccessToken, setAuthCookies } from '@/lib/server-auth';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  let auth = await getOrRefreshAccessToken(request);

  if (!auth?.accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    let response = await fetch(`${API_BASE}/api/v1/voice/greeting`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401 && request.cookies.get('refresh_token')?.value) {
      const refreshToken = request.cookies.get('refresh_token')!.value;
      const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        auth = {
          accessToken: refreshData.access_token,
          refreshToken: refreshData.refresh_token,
          isRefreshed: true,
        };
        response = await fetch(`${API_BASE}/api/v1/voice/greeting`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      }
    }

    const respContentType = response.headers.get('content-type') || '';
    let nextRes: NextResponse;
    if (respContentType.includes('application/json')) {
      const data = await response.json();
      nextRes = NextResponse.json(data, { status: response.status });
    } else {
      const text = await response.text();
      nextRes = NextResponse.json({ detail: text || response.statusText }, { status: response.status });
    }

    return setAuthCookies(nextRes, auth);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Voice greeting proxy failed';
    console.error('[VoiceGreetingProxy Error]:', err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
