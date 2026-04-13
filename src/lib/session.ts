import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { decode } from 'next-auth/jwt'

function getSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

/**
 * Reads the session from either:
 *  - hi-session       (set by accept-launch after SSO from hexamatics-suite)
 *  - hexainsight.session-token  (set by next-auth for users who log in directly)
 */
export async function getSession() {
  const cookieStore = cookies()

  // ── SSO path: hi-session (signed JWS from accept-launch) ─────────────────
  const hiToken = cookieStore.get('hi-session')?.value
  if (hiToken) {
    try {
      const { payload } = await jwtVerify(hiToken, getSecret())
      if (payload?.email) {
        return {
          user: {
            email: payload.email as string,
            name: (payload.name as string) ?? null,
            role: (payload.role as string) ?? 'user',
          },
        }
      }
    } catch { /* fall through */ }
  }

  // ── Direct login path: hexainsight.session-token (next-auth JWE) ─────────
  const naToken = cookieStore.get('hexainsight.session-token')?.value
  if (naToken) {
    try {
      const payload = await decode({
        token: naToken,
        secret: process.env.NEXTAUTH_SECRET!,
        salt: 'hexainsight.session-token',
      })
      if (payload?.email) {
        return {
          user: {
            email: payload.email as string,
            name: (payload.name as string) ?? null,
            role: (payload.role as string) ?? 'user',
          },
        }
      }
    } catch { /* fall through */ }
  }

  return null
}
