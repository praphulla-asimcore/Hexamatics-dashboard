import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { encode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

// Cookie name used only on reporting.hexamatics.finance — avoids conflict
// with the suite's hexa-suite.session-token (domain .hexamatics.finance)
const DASHBOARD_COOKIE = 'hexainsight.session-token'

export async function GET(req: NextRequest) {
  const launchToken = req.nextUrl.searchParams.get('token')
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  if (!launchToken) {
    console.error('[accept-launch] No token param — redirecting to suite login')
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
    const { payload } = await jwtVerify(launchToken, secret)

    if (!payload.email) {
      throw new Error('Invalid launch token: no email')
    }

    const sessionToken = await encode({
      token: {
        email: payload.email as string,
        name: payload.name as string,
        role: (payload.role as string) ?? 'user',
        sub: payload.email as string,
      },
      secret: process.env.NEXTAUTH_SECRET!,
      salt: DASHBOARD_COOKIE,
      maxAge: 30 * 24 * 60 * 60,
    })

    const response = NextResponse.redirect(new URL(callbackUrl, req.url))
    response.cookies.set(DASHBOARD_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (err) {
    console.error('[accept-launch] Token verification failed:', err)
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }
}
