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

    let response = await fetch(`${API_BASE}/api/v1/voice/synthesize`, {
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
        response = await fetch(`${API_BASE}/api/v1/voice/synthesize`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      const errRes = NextResponse.json(
        { detail: errorText || 'Speech synthesis failed' },
        { status: response.status }
      );
      return setAuthCookies(errRes, auth);
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const successRes = new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="speech.audio"',
        'Cache-Control': 'no-cache',
      },
    });
    return setAuthCookies(successRes, auth);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Synthesis proxy failed';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

