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
  const safeUrl = callbackUrl.startsWith('/') ? callbackUrl : '/dashboard'

  if (!launchToken) {
    console.error('[accept-launch] No token param')
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }

  try {
    const { payload } = await jwtVerify(launchToken, getSecret())
    if (!payload.email) throw new Error('No email in token')

    // Sign a simple HS256 JWT — no salt/HKDF complexity
    const sessionToken = await new SignJWT({
      email: payload.email,
      name: payload.name ?? '',
      role: payload.role ?? 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecret())

    console.log('[accept-launch] Success for', payload.email, 'token length:', sessionToken.length)

    const response = NextResponse.redirect(new URL(safeUrl, req.url))
    response.cookies.set(DASHBOARD_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: 30 * 24 * 60 * 60,
    })
    return response
  } catch (err) {
    console.error('[accept-launch] Failed:', err)
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }
}
