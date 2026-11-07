/**
 * Privy Auth endpoint - proxies Privy credential to FastAPI backend and sets HttpOnly cookies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';

const PRIVY_APP_ID =
  process.env['PRIVY_APP_ID'] ||
  process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ||
  'cmw51o126004a0gjt3pfuddy1';
const PRIVY_APP_SECRET =
  process.env['PRIVY_APP_SECRET'] ||
  'privy_app_secret_5XyYhWLSjGin2YVwp1pK4omPGezEXNRBZxC4LY9ebwmH8s6VeuCGJ9CecAsdh5Gb14r2mcGuHVaH5VWoK9d4jSoA';
const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:8000';

const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body.token;

    let verifiedSub = body.privy_user_id;
    if (token) {
      try {
        const claims = await privy.utils().auth().verifyAuthToken(token);
        if (claims?.user_id) {
          verifiedSub = claims.user_id;
        }
      } catch (verifyErr) {
        console.warn('Privy verifyAuthToken check (proceeding with payload):', verifyErr);
      }
    }

    const payload = {
      token: token || '',
      privy_user_id: verifiedSub || body.privy_user_id,
      email: body.email,
      wallet_address: body.wallet_address,
      full_name: body.full_name,
    };

    const response = await fetch(`${API_BASE}/api/v1/auth/privy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { detail: data.detail || 'Privy sign-in failed' },
        { status: response.status }
      );
    }

    const res = NextResponse.json(data);

    // Set HttpOnly cookies
    res.cookies.set('access_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    res.cookies.set('refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (error) {
    console.error('Privy auth error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}
