import { cookies } from 'next/headers'
import { decode } from 'next-auth/jwt'

const COOKIE = 'hexainsight.session-token'

/**
 * Reads the session from our custom cookie.
 * Use this instead of getServerSession() in App Router route handlers —
 * getServerSession has known issues reading cookies in this context.
 */
export async function getSession() {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null

  try {
    const payload = await decode({
      token,
      secret: process.env.NEXTAUTH_SECRET!,
      salt: COOKIE,
    })
    if (!payload?.email) return null
    return {
      user: {
        email: payload.email as string,
        name: (payload.name as string) ?? null,
        role: (payload.role as string) ?? 'user',
      },
    }
  } catch {
    return null
  }
}
