import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieNames = cookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)

  const cookieValue = req.cookies.get('hexa-suite.session-token')?.value

  let tokenEmptySalt = null
  let tokenNamedSalt = null

  if (cookieValue) {
    try {
      tokenEmptySalt = await decode({
        token: cookieValue,
        secret: process.env.NEXTAUTH_SECRET!,
        salt: '',
      })
    } catch { /* ignore */ }

    try {
      tokenNamedSalt = await decode({
        token: cookieValue,
        secret: process.env.NEXTAUTH_SECRET!,
        salt: 'hexa-suite.session-token',
      })
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    cookieNamesPresent: cookieNames,
    hasSessionCookie: cookieNames.includes('hexa-suite.session-token'),
    tokenFoundEmptySalt: !!tokenEmptySalt,
    tokenFoundNamedSalt: !!tokenNamedSalt,
    tokenEmail: tokenEmptySalt?.email ?? tokenNamedSalt?.email ?? null,
    secret_prefix: (process.env.NEXTAUTH_SECRET ?? '').slice(0, 8),
  })
}
