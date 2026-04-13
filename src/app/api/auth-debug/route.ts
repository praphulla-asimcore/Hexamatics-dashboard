import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieNames = cookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)

  const cookieValue = req.cookies.get('hexa-suite.session-token')?.value
  const secret = process.env.NEXTAUTH_SECRET!

  let tokenEmptySalt = null
  let tokenNamedSalt = null
  let tokenJws: Record<string, unknown> | null = null

  if (cookieValue) {
    // Try next-auth JWE with empty salt (old next-auth encoding)
    try {
      tokenEmptySalt = await decode({ token: cookieValue, secret, salt: '' })
    } catch { /* ignore */ }

    // Try next-auth JWE with cookie name as salt (new next-auth encoding)
    try {
      tokenNamedSalt = await decode({ token: cookieValue, secret, salt: 'hexa-suite.session-token' })
    } catch { /* ignore */ }

    // Try plain signed JWT (JWS / HS256) — used by some custom auth setups
    try {
      const key = new TextEncoder().encode(secret)
      const { payload } = await jwtVerify(cookieValue, key)
      tokenJws = payload as Record<string, unknown>
    } catch { /* ignore */ }
  }

  const found = tokenEmptySalt ?? tokenNamedSalt ?? tokenJws

  return NextResponse.json({
    cookieNamesPresent: cookieNames,
    hasSessionCookie: cookieNames.includes('hexa-suite.session-token'),
    tokenFoundEmptySalt: !!tokenEmptySalt,
    tokenFoundNamedSalt: !!tokenNamedSalt,
    tokenFoundJws: !!tokenJws,
    tokenEmail: (found as any)?.email ?? null,
    secret_prefix: secret.slice(0, 8),
  })
}
