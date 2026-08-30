/**
 * PostgreSQL-backed shared cache.
 *
 * Table: cache_store (key TEXT PK, value JSONB, expires_at TIMESTAMPTZ)
 * Created automatically on first use (idempotent).
 *
 * Falls back silently to null/no-op when DATABASE_URL is absent (local dev).
 * Port 25061 = DigitalOcean PgBouncer (transaction mode) — no prepared
 * statements, each query() releases connection immediately.
 */

import { getPool } from './pg'

let tableReady = false

async function ensureTable(): Promise<boolean> {
  if (tableReady) return true
  const pool = getPool()
  if (!pool) return false
  try {
    // Run as separate queries — PgBouncer transaction mode rejects
    // multiple statements in a single pool.query() call
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cache_store (
        key        TEXT        PRIMARY KEY,
        value      JSONB       NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_store (expires_at)
    `)
    tableReady = true
    return true
  } catch (err: any) {
    console.error('[pg-cache] table init failed:', err.message)
    return false
  }
}

export async function pgGet<T>(key: string): Promise<T | null> {
  const pool = getPool()
  if (!pool) return null
  try {
    if (!(await ensureTable())) return null
    const res = await pool.query<{ value: T }>(
      `SELECT value FROM cache_store WHERE key = $1 AND expires_at > NOW()`,
      [key]
    )
    return res.rows[0]?.value ?? null
  } catch (err: any) {
    console.error('[pg-cache] get error:', err.message)
    return null
  }
}

/**
 * Like pgGet but ignores expiry — returns the last value ever cached under
 * this key, however old. Used as a last-known-good fallback when a live
 * refresh fails (e.g. Zoho rate-limited) so users see stale data instead
 * of a hard error.
 */
export async function pgGetStale<T>(key: string): Promise<T | null> {
  const pool = getPool()
  if (!pool) return null
  try {
    if (!(await ensureTable())) return null
    const res = await pool.query<{ value: T }>(
      `SELECT value FROM cache_store WHERE key = $1`,
      [key]
    )
    return res.rows[0]?.value ?? null
  } catch (err: any) {
    console.error('[pg-cache] getStale error:', err.message)
    return null
  }
}

export async function pgSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const pool = getPool()
  if (!pool) return
  try {
    if (!(await ensureTable())) return
    await pool.query(
      `INSERT INTO cache_store (key, value, expires_at)
       VALUES ($1, $2::jsonb, NOW() + ($3::int * INTERVAL '1 second'))
       ON CONFLICT (key) DO UPDATE
         SET value      = EXCLUDED.value,
             expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(value), ttlSeconds]
    )
  } catch (err: any) {
    console.error('[pg-cache] set error:', err.message)
  }
}

export async function pgDel(key: string): Promise<void> {
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(`DELETE FROM cache_store WHERE key = $1`, [key])
  } catch {}
}

/** Purge expired rows — call from cron to keep the table lean. */
export async function pgPurgeExpired(): Promise<void> {
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(`DELETE FROM cache_store WHERE expires_at <= NOW()`)
  } catch {}
}
