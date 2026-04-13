import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'

export const dynamic = 'force-dynamic'

export const DASHBOARD_COOKIE = 'hi-session'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

export async function GET(req: NextRequest) {
  const launchToken = req.nextUrl.searchParams.get('token')
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  // Accept relative paths OR full URLs on the same hostname
  let safeUrl = '/dashboard'
  try {
    const parsed = new URL(callbackUrl)
    if (parsed.hostname === new URL(req.url).hostname) {
      safeUrl = parsed.pathname + (parsed.search ?? '')
    }
  } catch {
    if (callbackUrl.startsWith('/')) safeUrl = callbackUrl
  }

  if (!launchToken) {
    return new NextResponse(
      `<html><body><h2>accept-launch: no token param</h2></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  try {
    const { payload } = await jwtVerify(launchToken, getSecret())
    if (!payload.email) throw new Error('No email in token')

    const sessionToken = await new SignJWT({
      email: payload.email,
      name: payload.name ?? '',
      role: payload.role ?? 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecret())

    console.log('[accept-launch] Success for', payload.email)

    // Pass the session token to /auth-complete via URL hash.
    // auth-complete does a same-origin POST to /api/auth/set-session which sets
    // the httpOnly cookie — same-origin POST cookies are never blocked by browsers.
    const authCompleteUrl = `/auth-complete?to=${encodeURIComponent(safeUrl)}`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>
var t = ${JSON.stringify(encodeURIComponent(sessionToken))};
window.location.replace(${JSON.stringify(authCompleteUrl)} + '#' + t);
</script>
</head><body>Completing sign-in…</body></html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
      },
    })
  } catch (err) {
    console.error('[accept-launch] Failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(
      `<html><body><h2>accept-launch failed</h2><pre>${msg}</pre><p>Secret prefix: ${process.env.NEXTAUTH_SECRET?.slice(0, 8)}</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }
}
