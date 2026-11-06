/**
 * Avatars API proxy.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    const response = await fetch(
      `${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/avatars?${queryString}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
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
    const message = err instanceof Error ? err.message : 'Failed to fetch avatars';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    const response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/avatars`, {
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
    const message = err instanceof Error ? err.message : 'Failed to create avatar';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}