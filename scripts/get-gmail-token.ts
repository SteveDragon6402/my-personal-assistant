/**
 * One-time OAuth flow to get a Gmail (and Calendar) refresh token.
 * Run from project root: npm run gmail-token
 *
 * Prerequisites:
 * 1. In Google Cloud Console: create OAuth client (Desktop app), get Client ID and Secret.
 * 2. Add redirect URI: http://localhost:3001/callback
 * 3. In .env set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET
 *
 * Then run this script; browser opens, you sign in, and the refresh token is printed.
 */
import 'dotenv/config';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const PORT = 3001;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env. Get them from Google Cloud Console → Credentials → OAuth 2.0 Client ID.'
  );
  process.exit(1);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

async function exchangeCodeForTokens(code: string): Promise<{ refresh_token?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { refresh_token?: string };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    const state = Math.random().toString(36).slice(2);
    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId!,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString();
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<p>Authorization failed: ${error}</p><p>Check the terminal for details.</p>`
      );
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing code');
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      const refreshToken = tokens.refresh_token;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<p><strong>Success!</strong></p><p>Check your terminal for the refresh token. Add it to .env as GMAIL_REFRESH_TOKEN=...</p><p>You can use the same token for calendar: set GMAIL_REFRESH_TOKEN and also GCAL_CLIENT_ID/GCAL_CLIENT_SECRET/GCAL_REFRESH_TOKEN (or reuse Gmail client id/secret and this refresh token).</p>'
      );
      server.close();
      if (refreshToken) {
        console.log('\n--- Add this to your .env file ---\n');
        console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
        console.log('\nOptional (for Calendar): use the same token or set GCAL_REFRESH_TOKEN to the same value.\n');
      } else {
        console.warn('No refresh_token in response. Try revoking app access at myaccount.google.com/permissions and run again with prompt=consent.');
      }
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token exchange failed. See terminal.');
      server.close();
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT} in your browser (opening automatically)...`);
  console.log('Sign in with Google and approve access. The refresh token will appear here.\n');
  openBrowser(`http://localhost:${PORT}`);
});
