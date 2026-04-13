import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

export async function middleware(req: NextRequest) {
  const cookieValue = req.cookies.get('hi-session')?.value

  let valid = false
  if (cookieValue) {
    try {
      await jwtVerify(cookieValue, getSecret())
      valid = true
    } catch {
      valid = false
    }
  }

  if (!valid) {
    const launchUrl = `https://www.hexamatics.finance/api/auth/launch-app?callbackUrl=${encodeURIComponent(req.url)}`
    return NextResponse.redirect(launchUrl)
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
