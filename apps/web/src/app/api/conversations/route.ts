import { NextRequest, NextResponse } from 'next/server';
import { getOrRefreshAccessToken, setAuthCookies } from '@/lib/server-auth';

const API_BASE = process.env["API_BASE_URL"] || 'http://localhost:8000';

async function forwardRequest(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
) {
  let auth = await getOrRefreshAccessToken(request);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (auth?.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`;
  }

  let response = await fetch(`${API_BASE}/api/v1/conversations${path}`, {
    ...init,
    headers,
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
      headers['Authorization'] = `Bearer ${auth.accessToken}`;
      response = await fetch(`${API_BASE}/api/v1/conversations${path}`, {
        ...init,
        headers,
      });
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return NextResponse.json(
      { detail: data.detail || 'Request failed' },
      { status: response.status }
    );
  }

  const nextRes = NextResponse.json(data);
  return setAuthCookies(nextRes, auth);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('page_size') || '20';

  return forwardRequest(request, `?page=${page}&page_size=${pageSize}`, { method: 'GET' });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return forwardRequest(request, '', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}