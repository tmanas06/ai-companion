import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    const response = await fetch(`${API_BASE}/api/v1/voice/transcribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json({ detail: text || response.statusText }, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transcription proxy failed';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
