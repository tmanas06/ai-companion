import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE}/api/v1/voice/synthesize-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { detail: errorText || 'Streaming speech synthesis failed' },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json({ detail: 'No response stream' }, { status: 500 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-cache, no-transform',
        'X-Turn-ID': response.headers.get('x-turn-id') || '',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Synthesis stream proxy failed';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
