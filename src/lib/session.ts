import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'

const COOKIE = 'hi-session'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

export async function getSession() {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
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
