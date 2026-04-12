import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieNames = cookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: 'next-auth.session-token',
  })

  return NextResponse.json({
    cookieNamesPresent: cookieNames,
    hasSessionCookie: cookieNames.includes('next-auth.session-token'),
    tokenFound: !!token,
    tokenEmail: token?.email ?? null,
    secret_prefix: (process.env.NEXTAUTH_SECRET ?? '').slice(0, 8),
  })
}
