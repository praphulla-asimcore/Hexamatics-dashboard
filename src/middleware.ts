import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const cookieValue = req.cookies.get('hexa-suite.session-token')?.value

  let token = null
  if (cookieValue) {
    try {
      token = await decode({
        token: cookieValue,
        secret: process.env.NEXTAUTH_SECRET!,
        salt: '',
      })
    } catch {
      token = null
    }
  }

  if (!token) {
    const suiteLogin = `https://hexamatics.finance/login?callbackUrl=${encodeURIComponent(req.url)}`
    return NextResponse.redirect(suiteLogin)
  }

  return NextResponse.next()
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
