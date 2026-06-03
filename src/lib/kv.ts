/**
 * Thin wrapper around @vercel/kv.
 * Falls back silently when KV env vars are absent (local dev).
 */

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!hasKv()) return null
  try {
    const { kv } = await import('@vercel/kv')
    return await kv.get<T>(key)
  } catch {
    return null
  }
}

export async function kvSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  if (!hasKv()) return
  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(key, value, { ex: ttlSeconds })
  } catch {
    // non-fatal — in-memory cache still works as fallback
  }
}

export async function kvDel(key: string): Promise<void> {
  if (!hasKv()) return
  try {
    const { kv } = await import('@vercel/kv')
    await kv.del(key)
  } catch {}
}
