// scripts/get-refresh-token.ts
//
// One-off helper: mints a fresh Google Ads OAuth2 refresh token.
//
//   npm run get-token
//
// Why this exists: Google expires refresh tokens — most often because the
// OAuth consent screen is in "Testing" mode (7-day expiry). When the app
// starts failing every Google Ads call with `invalid_grant`, run this,
// then paste the new value into GOOGLE_ADS_REFRESH_TOKEN (Vercel env vars
// + local .env.local) and redeploy.
//
// Zero new dependencies: uses Node built-ins + global fetch only. It runs
// a throwaway loopback HTTP server to catch Google's OAuth redirect.

import http from 'node:http'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCOPE = 'https://www.googleapis.com/auth/adwords'
const PORT = Number(process.env.OAUTH_PORT) || 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

// ── Load .env.local without a dotenv dependency ───────────────────────────
function loadEnvLocal(): void {
  try {
    const file = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of file.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const key = m[1]!
      let val = m[2]!
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // .env.local is optional — values may be exported in the shell instead.
  }
}

loadEnvLocal()

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '\n✗ Missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET.\n' +
      '  Add them to .env.local (or export them in your shell) and re-run.\n',
  )
  process.exit(1)
}

const state = crypto.randomBytes(16).toString('hex')

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token on every run
    state,
  }).toString()

async function exchangeCodeForTokens(code: string): Promise<{
  refresh_token?: string
  access_token?: string
  expires_in?: number
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`)
  }
  return json
}

/**
 * Best-effort browser open. Uses execFile (NOT exec) so the URL is passed
 * as an argv entry, never interpolated into a shell command — no injection
 * surface. Never throws: printing the URL is the fallback.
 */
function tryOpenBrowser(url: string): void {
  try {
    if (process.platform === 'darwin') {
      execFile('open', [url], () => {})
    } else if (process.platform === 'win32') {
      // cmd's `start`: first quoted arg is the window title (empty here).
      execFile('cmd', ['/c', 'start', '', url], () => {})
    } else {
      execFile('xdg-open', [url], () => {})
    }
  } catch {
    /* ignore — the URL is also printed for manual use */
  }
}

function finish(server: http.Server, code: number): void {
  server.close()
  process.exit(code)
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/oauth2callback')) {
    res.writeHead(404).end('Not found')
    return
  }

  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  if (err) {
    res
      .writeHead(400, { 'Content-Type': 'text/html' })
      .end(`<h1>Authorization failed</h1><p>${err}</p>`)
    console.error(`\n✗ Authorization denied: ${err}\n`)
    return finish(server, 1)
  }

  if (returnedState !== state) {
    res.writeHead(400).end('State mismatch — aborting')
    console.error('\n✗ State mismatch (possible CSRF). Aborting.\n')
    return finish(server, 1)
  }

  if (!code) {
    res.writeHead(400).end('No authorization code in callback')
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    res
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end(
        '<h1>✓ Success</h1><p>Your refresh token has been printed in the ' +
          'terminal. You can close this tab.</p>',
      )

    if (!tokens.refresh_token) {
      console.error(
        '\n✗ No refresh_token returned. The account likely already granted\n' +
          '  access. Revoke it at https://myaccount.google.com/connections\n' +
          '  then re-run this script.\n',
      )
      return finish(server, 1)
    }

    console.log(
      '\n──────────────────────────────────────────────────────────────\n' +
        ' ✓ NEW GOOGLE_ADS_REFRESH_TOKEN\n' +
        '──────────────────────────────────────────────────────────────\n\n' +
        tokens.refresh_token +
        '\n\n' +
        '──────────────────────────────────────────────────────────────\n' +
        ' Next steps:\n' +
        '  1. Vercel → Project Settings → Environment Variables:\n' +
        '     set GOOGLE_ADS_REFRESH_TOKEN to the value above → Save.\n' +
        '  2. Put the same value in your local .env.local.\n' +
        '  3. Redeploy (Vercel → Deployments → ⋯ → Redeploy).\n' +
        '──────────────────────────────────────────────────────────────\n',
    )
    return finish(server, 0)
  } catch (e) {
    res.writeHead(500).end('Token exchange failed — see terminal')
    console.error('\n✗', e instanceof Error ? e.message : e, '\n')
    return finish(server, 1)
  }
})

server.listen(PORT, () => {
  console.log(
    '\nGoogle Ads refresh-token helper\n' +
      '──────────────────────────────────────────────────────────────\n' +
      `Redirect URI : ${REDIRECT_URI}\n\n` +
      'This exact URI must be allowed for your OAuth client:\n' +
      '  • "Desktop app" client type → allowed automatically.\n' +
      '  • "Web application" client type → add it under "Authorized\n' +
      '    redirect URIs" (Google Cloud Console → APIs & Services →\n' +
      '    Credentials → your OAuth 2.0 Client ID).\n' +
      '──────────────────────────────────────────────────────────────\n\n' +
      'Opening your browser. If it does not open, paste this URL\n' +
      '(sign in with an account that has access to the MCC):\n\n' +
      authUrl +
      '\n\nWaiting for the redirect…\n',
  )
  tryOpenBrowser(authUrl)
})
