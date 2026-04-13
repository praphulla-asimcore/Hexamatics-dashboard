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

    // Set cookie via raw header — most reliable approach on Vercel.
    // 200 response (not redirect) so the CDN never strips Set-Cookie.
    // JS redirect fires after cookie is stored.
    const maxAge = 30 * 24 * 60 * 60
    const cookieHeader = `${DASHBOARD_COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Secure; Max-Age=${maxAge}`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>location.replace(${JSON.stringify(safeUrl)})</script>
</head><body>Authenticated. Redirecting…</body></html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
        'Set-Cookie': cookieHeader,
      },
    })
  } catch (err) {
    console.error('[accept-launch] Failed:', err)
    // Show the error visibly so we can diagnose — do NOT redirect silently
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(
      `<html><body><h2>accept-launch failed</h2><pre>${msg}</pre><p>Secret prefix: ${process.env.NEXTAUTH_SECRET?.slice(0, 8)}</p><p>Token length: ${launchToken?.length}</p></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }
}
