import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE}/api/v1/voice/synthesize`, {
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
        { detail: errorText || 'Speech synthesis failed' },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="speech.audio"',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Synthesis proxy failed';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
