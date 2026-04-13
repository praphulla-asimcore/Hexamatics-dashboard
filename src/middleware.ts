import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { decode } from 'next-auth/jwt'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

export async function middleware(req: NextRequest) {
  // ── SSO path: hi-session (signed JWS from accept-launch) ─────────────────
  const hiSession = req.cookies.get('hi-session')?.value
  if (hiSession) {
    try {
      await jwtVerify(hiSession, getSecret())
      return NextResponse.next()
    } catch { /* fall through */ }
  }

  // ── Direct login path: hexainsight.session-token (next-auth JWE) ─────────
  const naSession = req.cookies.get('hexainsight.session-token')?.value
  if (naSession) {
    try {
      const token = await decode({
        token: naSession,
        secret: process.env.NEXTAUTH_SECRET!,
        salt: 'hexainsight.session-token',
      })
      if (token?.email) return NextResponse.next()
    } catch { /* fall through */ }
  }

  // No valid session — send to suite SSO
  const launchUrl = `https://www.hexamatics.finance/api/auth/launch-app?callbackUrl=${encodeURIComponent(req.url)}`
  return NextResponse.redirect(launchUrl)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/board/:path*',
    '/financials/:path*',
    '/executive/:path*',
  ],
}
