import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

// Called via same-origin POST from /auth-complete.
// Sets the httpOnly hi-session cookie. Same-origin POST responses
// are always stored by browsers — no cross-site cookie issues.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = body?.token
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    // Verify the session token is a valid signed JWT from accept-launch
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const maxAge = 30 * 24 * 60 * 60
    const response = NextResponse.json({ ok: true })
    response.cookies.set('hi-session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge,
    })
    console.log('[set-session] Cookie set for', payload.email)
    return response
  } catch (err) {
    console.error('[set-session] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
