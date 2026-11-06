import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let response: Response;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      response = await fetch(`${API_BASE}/api/v1/sadtalker/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
    } else {
      const json = await request.json();
      const fd = new FormData();
      for (const [k, v] of Object.entries(json)) {
        if (v !== undefined && v !== null) {
          fd.append(k, String(v));
        }
      }
      response = await fetch(`${API_BASE}/api/v1/sadtalker/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: fd,
      });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit SadTalker job';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
