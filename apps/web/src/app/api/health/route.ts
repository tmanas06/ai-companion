import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ai-companion-web',
    timestamp: new Date().toISOString(),
  });
}