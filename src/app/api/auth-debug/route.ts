import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieNames = cookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)

  const secret = process.env.NEXTAUTH_SECRET!

  // Check the dashboard-specific cookie (set by accept-launch)
  const dashboardCookie = req.cookies.get('hexainsight.session-token')?.value
  let dashboardToken = null
  if (dashboardCookie) {
    try {
      dashboardToken = await decode({ token: dashboardCookie, secret, salt: 'hexainsight.session-token' })
    } catch { /* ignore */ }
  }

  // Check the suite cookie (shared via .hexamatics.finance domain)
  const suiteCookie = req.cookies.get('hexa-suite.session-token')?.value
  let suiteTokenNamedSalt = null
  let suiteTokenEmptySalt = null
  let suiteTokenJws = null
  if (suiteCookie) {
    try { suiteTokenNamedSalt = await decode({ token: suiteCookie, secret, salt: 'hexa-suite.session-token' }) } catch { /* ignore */ }
    try { suiteTokenEmptySalt = await decode({ token: suiteCookie, secret, salt: '' }) } catch { /* ignore */ }
    try {
      const { payload } = await jwtVerify(suiteCookie, new TextEncoder().encode(secret))
      suiteTokenJws = payload
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    cookieNamesPresent: cookieNames,
    dashboard: {
      cookiePresent: !!dashboardCookie,
      tokenDecoded: !!dashboardToken,
      email: (dashboardToken as any)?.email ?? null,
    },
    suite: {
      cookiePresent: !!suiteCookie,
      namedSalt: !!suiteTokenNamedSalt,
      emptySalt: !!suiteTokenEmptySalt,
      jws: !!suiteTokenJws,
    },
    secret_prefix: secret.slice(0, 32),
  })
}
