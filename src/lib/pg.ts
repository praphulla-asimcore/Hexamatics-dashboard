/**
 * PostgreSQL connection pool — DigitalOcean managed database via PgBouncer.
 * Port 25061 is the PgBouncer pooler (transaction mode), so each query()
 * call gets a connection from the pool and releases it immediately.
 *
 * DATABASE_URL env var format:
 *   postgresql://doadmin:<password>@<host>:25061/financedb-pool?sslmode=require
 */

import { Pool } from 'pg'

let _pool: Pool | null = null

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // DigitalOcean managed DB uses self-signed CA
      max: 3,                              // small per-Lambda pool; PgBouncer handles the rest
      idleTimeoutMillis: 8_000,
      connectionTimeoutMillis: 5_000,
    })
    _pool.on('error', (err) => {
      console.error('[pg] pool error:', err.message)
    })
  }
  return _pool
}
