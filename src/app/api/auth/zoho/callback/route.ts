import { NextRequest, NextResponse } from 'next/server'

const DC = process.env.ZOHO_DC || 'com'

/**
 * One-time OAuth flow to obtain your refresh_token.
 *
 * Step 1: Visit this URL in your browser (replace YOUR_DOMAIN):
 *   https://accounts.zoho.com/oauth/v2/auth
 *     ?response_type=code
 *     &client_id=YOUR_CLIENT_ID
 *     &scope=ZohoBooks.fullaccess.ALL
 *     &redirect_uri=https://YOUR_DOMAIN/api/auth/zoho/callback
 *     &access_type=offline
 *     &prompt=consent
 *
 * Step 2: After authorizing, Zoho redirects here with ?code=xxx
 * Step 3: This route exchanges the code for tokens and displays your refresh_token
 * Step 4: Copy the refresh_token into your .env.local / Vercel env vars
 *
 * You only need to do this ONCE.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    // Show setup instructions
    const clientId = process.env.ZOHO_CLIENT_ID || 'YOUR_CLIENT_ID'
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/zoho/callback`
    const authUrl =
      `https://accounts.zoho.${DC}/oauth/v2/auth` +
      `?response_type=code` +
      `&client_id=${clientId}` +
      `&scope=ZohoBooks.fullaccess.ALL` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&access_type=offline` +
      `&prompt=consent`

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;max-width:600px">
        <h2>Zoho OAuth Setup</h2>
        <p>Click the link below to authorize access to Zoho Books:</p>
        <a href="${authUrl}" style="display:inline-block;background:#e14234;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
          Connect Zoho Books
        </a>
        <p style="margin-top:1rem;color:#666;font-size:14px">
          After authorizing, you will be redirected back here with your refresh_token.
          Copy it into your <code>.env.local</code> as <code>ZOHO_REFRESH_TOKEN</code>.
        </p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Exchange code for tokens
  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/zoho/callback`
    const params = new URLSearchParams({
      code,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })

    const res = await fetch(
      `https://accounts.zoho.${DC}/oauth/v2/token?${params}`,
      { method: 'POST' }
    )
    const tokens = await res.json()

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;max-width:600px">
        <h2>✅ Zoho Connected Successfully!</h2>
        <p>Copy the <strong>refresh_token</strong> below into your environment variables:</p>
        <pre style="background:#f4f4f4;padding:1rem;border-radius:6px;word-break:break-all;font-size:13px">${tokens.refresh_token || JSON.stringify(tokens, null, 2)}</pre>
        <p style="color:#666;font-size:14px">
          Set this as <code>ZOHO_REFRESH_TOKEN</code> in Vercel → Settings → Environment Variables.<br/>
          This page is only needed once. The dashboard will refresh tokens automatically going forward.
        </p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
