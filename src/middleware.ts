import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

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
