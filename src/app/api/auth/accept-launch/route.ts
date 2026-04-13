import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { encode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

const DASHBOARD_COOKIE = 'hexainsight.session-token'

export async function GET(req: NextRequest) {
  const launchToken = req.nextUrl.searchParams.get('token')
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  if (!launchToken) {
    console.error('[accept-launch] No token param')
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
    const { payload } = await jwtVerify(launchToken, secret)

    if (!payload.email) throw new Error('No email in token')

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

    console.log('[accept-launch] Success for', payload.email, '— setting cookie via HTML response')

    // Return a 200 HTML page that sets the cookie and redirects.
    // This is more reliable than NextResponse.redirect() + Set-Cookie
    // in cross-origin redirect chains where some browsers drop the cookie.
    const safeUrl = callbackUrl.startsWith('/') ? callbackUrl : '/dashboard'
    const cookieStr = `${DASHBOARD_COOKIE}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`

    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8">
      <script>window.location.replace(${JSON.stringify(safeUrl)})</script>
      </head><body></body></html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': cookieStr,
        },
      }
    )
  } catch (err) {
    console.error('[accept-launch] Token verification failed:', err)
    return NextResponse.redirect('https://www.hexamatics.finance/login')
  }
}
