/**
 * Companions API proxy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getOrRefreshAccessToken, setAuthCookies } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  let auth = await getOrRefreshAccessToken(request);
  
  if (!auth?.accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    let response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/companions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 && request.cookies.get('refresh_token')?.value) {
      const refreshToken = request.cookies.get('refresh_token')!.value;
      const refreshRes = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/auth/refresh`, {
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
        response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/companions`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${auth.accessToken}`,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    const contentType = response.headers.get('content-type') || '';
    let data: Record<string, unknown> | null = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { detail: text || response.statusText };
    }

    if (data && Array.isArray(data['items']) && !data['companions']) {
      data['companions'] = data['items'];
    }
    const nextRes = NextResponse.json(data, { status: response.status });
    return setAuthCookies(nextRes, auth);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch companions';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let auth = await getOrRefreshAccessToken(request);
  
  if (!auth?.accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    const response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/companions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || '';
    let data: unknown = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { detail: text || response.statusText };
    }

    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create companion';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}