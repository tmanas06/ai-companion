/**
 * Avatar assets API proxy.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  
  const response = await fetch(
    `${process.env.API_BASE_URL || 'http://localhost:8000'}/api/v1/avatars/assets?${queryString}`,
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

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  
  if (!accessToken) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  
  const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:8000'}/api/v1/avatars/assets`, {
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