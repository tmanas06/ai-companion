import { NextRequest, NextResponse } from 'next/server';
import { getOrRefreshAccessToken, setAuthCookies } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  let auth = await getOrRefreshAccessToken(request);

  if (!auth?.accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    let response: Response;
    let jsonBody: unknown = null;

    if (contentType.includes('multipart/form-data')) {
      const originalForm = await request.formData();
      // Buffer entries in memory so retry can safely create an unconsumed stream if needed
      const bufferedEntries: Array<[string, string | File]> = [];
      for (const [key, value] of originalForm.entries()) {
        if (value instanceof Blob) {
          const buffer = await value.arrayBuffer();
          const filename = value instanceof File ? value.name : 'audio.webm';
          bufferedEntries.push([key, new File([buffer], filename, { type: value.type })]);
        } else {
          bufferedEntries.push([key, value]);
        }
      }

      const buildFd = () => {
        const fd = new FormData();
        for (const [k, v] of bufferedEntries) {
          fd.append(k, v);
        }
        return fd;
      };

      response = await fetch(`${API_BASE}/api/v1/voice/turn`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: buildFd(),
        signal: AbortSignal.timeout(90000),
      });

      // If 401, access token may have just expired on backend - attempt one refresh and retry
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

          response = await fetch(`${API_BASE}/api/v1/voice/turn`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.accessToken}` },
            body: buildFd(),
            signal: AbortSignal.timeout(90000),
          });
        }
      }
    } else {
      jsonBody = await request.json();
      response = await fetch(`${API_BASE}/api/v1/voice/turn-json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonBody),
        signal: AbortSignal.timeout(90000),
      });

      // If 401, access token may have just expired on backend - attempt one refresh and retry
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

          response = await fetch(`${API_BASE}/api/v1/voice/turn-json`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${auth.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(jsonBody),
            signal: AbortSignal.timeout(90000),
          });
        }
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
    const message = err instanceof Error ? err.message : 'Voice turn proxy failed';
    console.error('[VoiceTurnProxy Error]:', err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
