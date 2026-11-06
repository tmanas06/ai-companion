/**
 * Active avatar API proxy.
 * Retrieves the authenticated user's active 3D avatar configuration.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const accessToken = request.cookies.get('access_token')?.value || tokenFromHeader;

  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const apiBase = process.env['API_BASE_URL'] || 'http://localhost:8000';
    const response = await fetch(`${apiBase}/api/v1/avatars/active`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
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
    const message = err instanceof Error ? err.message : 'Failed to fetch active avatar';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
