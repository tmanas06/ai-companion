/**
 * Conversations API proxy - forwards requests to FastAPI backend.
 */
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env["API_BASE_URL"] || 'http://localhost:8000';

async function forwardRequest(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
) {
  const accessToken = request.cookies.get('access_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}/api/v1/conversations${path}`, {
    ...init,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return NextResponse.json(
      { detail: data.detail || 'Request failed' },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
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