/**
 * Messages API proxy for a conversation.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('page_size') || '50';
  
  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const response = await fetch(
    `${process.env.API_BASE_URL || 'http://localhost:8000'}/api/v1/conversations/${id}/messages?page=${page}&page_size=${pageSize}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${request.cookies.get('access_token')?.value}`,
        'Content-Type': 'application/json',
      },
    });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

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

  const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:8000'}/api/v1/conversations/${id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}