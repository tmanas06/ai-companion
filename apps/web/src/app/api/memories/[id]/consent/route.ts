/**
 * Memory consent API proxy.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accessToken = request.cookies.get('access_token')?.value;
  const body = await request.json();
  
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/memories/${id}/consent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${request.cookies.get('access_token')?.value}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}