import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { encode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const launchToken = req.nextUrl.searchParams.get('token')
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  if (!launchToken) {
    return NextResponse.redirect('https://hexamatics.finance/login')
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
    const { payload } = await jwtVerify(launchToken, secret)

    if (!payload.email) {
      throw new Error('Invalid launch token: no email')
    }

    // Create a full NextAuth-compatible session JWT for this user
    const sessionToken = await encode({
      token: {
        email: payload.email as string,
        name: payload.name as string,
        role: (payload.role as string) ?? 'user',
        sub: payload.email as string,
      },
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Set the cookie locally on reporting.hexamatics.finance
    // The middleware looks for 'hexa-suite.session-token' and will find it here
    const response = NextResponse.redirect(new URL(callbackUrl, req.url))
    response.cookies.set('hexa-suite.session-token', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch {
    return NextResponse.redirect('https://hexamatics.finance/login')
  }
}
