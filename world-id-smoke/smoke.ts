import express from 'express';
import crypto from 'node:crypto';
import * as jose from 'jose';
import dotenv from 'dotenv';

dotenv.config();

const ISSUER = process.env.AGENT_PASS_ISSUER || 'https://auth.world.org';
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const PORT = Number(process.env.PORT) || 3000;
const FRESH_MAX_AGE = process.env.FRESH_MAX_AGE;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: CLIENT_ID and CLIENT_SECRET must be set in .env');
  process.exit(1);
}

// In-memory store for PKCE verifiers & nonces indexed by state
const sessions = new Map<string, { codeVerifier: string; nonce: string; timestamp: number }>();

async function main() {
  console.log(`\n🔍 Fetching OpenID Discovery from: ${ISSUER}/.well-known/openid-configuration`);
  
  let discovery: any;
  try {
    const discoveryRes = await fetch(`${ISSUER}/.well-known/openid-configuration`);
    if (!discoveryRes.ok) throw new Error(`HTTP ${discoveryRes.status} ${discoveryRes.statusText}`);
    discovery = await discoveryRes.json();
  } catch (err) {
    console.error(`❌ Discovery failed for ${ISSUER}:`, err);
    console.error(`👉 Tip: If discovery fails, set AGENT_PASS_ISSUER=https://sandbox.auth.world.org in .env and rerun.\n`);
    process.exit(1);
  }

  console.log('\n================ DISCOVERY RESULT ================');
  console.log(`• Issuer:                       ${discovery.issuer}`);
  console.log(`• Authorization Endpoint:       ${discovery.authorization_endpoint}`);
  console.log(`• Token Endpoint:               ${discovery.token_endpoint}`);
  console.log(`• JWKS URI:                     ${discovery.jwks_uri}`);
  console.log(`• Device Flow Endpoint:         ${discovery.device_authorization_endpoint ? 'Supported (' + discovery.device_authorization_endpoint + ')' : 'None'}`);
  console.log(`• ACR Values Supported:         ${discovery.acr_values_supported?.join(', ') || 'N/A'}`);
  console.log('==================================================\n');

  const jwks = jose.createRemoteJWKSet(new URL(discovery.jwks_uri));
  const app = express();

  // 1. Start Flow Route
  app.get('/start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    sessions.set(state, { codeVerifier, nonce, timestamp: Date.now() });

    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', 'openid');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    if (FRESH_MAX_AGE !== undefined) {
      authUrl.searchParams.set('max_age', FRESH_MAX_AGE);
    }

    console.log("AUTHORIZE:", authUrl.toString());
    console.log(`\n➡️  Redirecting user to World ID verification:\n   ${authUrl.toString()}\n`);
    res.redirect(authUrl.toString());
  });

  // 2. Callback Route (handles /callback and /auth/callback)
  const handleCallback = async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;

    // Handle user denial / error path
    if (error) {
      console.log(`\n⚠️  Verification declined or error: ${error} (${error_description || 'no details'})`);
      return res.status(200).send(`Not approved (${error}). Nothing happened.`);
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).send('Missing code or state parameter.');
    }

    const session = sessions.get(state);
    if (!session) {
      return res.status(400).send('Invalid or expired state session.');
    }
    sessions.delete(state);

    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: session.codeVerifier,
      });

      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('❌ Token exchange failed:', errText);
        return res.status(tokenRes.status).send(`Token exchange failed: ${errText}`);
      }

      const tokens = await tokenRes.json();
      if (!tokens.id_token) {
        throw new Error('Response did not contain an id_token');
      }

      // Verify the ID token JWT against World ID JWKS
      const { payload: claims } = await jose.jwtVerify(tokens.id_token, jwks, {
        issuer: discovery.issuer,
        audience: CLIENT_ID,
      });

      if (claims.nonce !== session.nonce) {
        throw new Error(`Nonce mismatch: expected ${session.nonce}, got ${claims.nonce}`);
      }

      const now = new Date();
      console.log('\n======================================================');
      console.log(`🎉 [${now.toISOString()}] FIRST SUCCESSFUL VALIDATION ✅`);
      console.log('================== PRINTED CLAIMS ====================');
      console.log(JSON.stringify(claims, null, 2));
      console.log('======================================================');
      console.log(`• sub (User ID):        ${claims.sub}`);
      console.log(`• acr (Assurance Level): ${claims.acr}`);
      console.log(`• auth_time:            ${claims.auth_time} (${new Date(Number(claims.auth_time) * 1000).toLocaleString()})`);
      console.log('======================================================\n');

      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>AETHRA - World ID Validated</title>
            <style>
              body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #f4f4f5; padding: 40px 20px; text-align: center; }
              .card { max-width: 600px; margin: 0 auto; background: #121212; border: 1px solid #27272a; border-radius: 16px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); text-align: left; }
              h1 { color: #34d399; font-size: 24px; margin-bottom: 20px; text-align: center; }
              pre { background: #18181b; padding: 16px; border-radius: 8px; overflow-x: auto; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
              .item { margin: 12px 0; font-size: 14px; }
              .label { color: #a1a1aa; font-weight: 600; }
              .val { color: #38bdf8; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Approved and validated ✅</h1>
              <div class="item"><span class="label">sub:</span> <span class="val">${claims.sub}</span></div>
              <div class="item"><span class="label">acr:</span> <span class="val">${claims.acr}</span></div>
              <div class="item"><span class="label">auth_time:</span> <span class="val">${claims.auth_time}</span> (${new Date(Number(claims.auth_time) * 1000).toISOString()})</div>
              <h3 style="margin-top: 24px; font-size: 14px; color: #71717a;">Raw Claims:</h3>
              <pre>${JSON.stringify(claims, null, 2)}</pre>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('❌ Validation error:', err);
      res.status(500).send(`Token validation failed: ${err.message}`);
    }
  };

  app.get('/callback', handleCallback);
  app.get('/auth/callback', handleCallback);

  app.listen(PORT, () => {
    console.log(`🚀 Smoke test server listening on http://localhost:${PORT}`);
    console.log(`👉 Open http://localhost:${PORT}/start in your browser to begin World ID check.\n`);
  });
}

main().catch(console.error);

