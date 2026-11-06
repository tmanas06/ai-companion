/**
 * Get current user endpoint - proxies to FastAPI backend with auth cookie.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getOrRefreshAccessToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getOrRefreshAccessToken(request);
    
    if (!auth?.accessToken) {
      return NextResponse.json(
        { detail: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    const response = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Try to refresh token
      const refreshToken = request.cookies.get('refresh_token')?.value;
      if (refreshToken) {
        const refreshResponse = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          
          // Retry with new token
          const retryResponse = await fetch(`${process.env["API_BASE_URL"] || 'http://localhost:8000'}/api/v1/auth/me`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${refreshData.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const response_ = NextResponse.json(retryData);
            
            response_.cookies.set('access_token', refreshData.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 15,
            });
            response_.cookies.set('refresh_token', refreshData.refresh_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 30,
            });

            return response_;
          }
        }
      }
      
      return NextResponse.json(
        { detail: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}