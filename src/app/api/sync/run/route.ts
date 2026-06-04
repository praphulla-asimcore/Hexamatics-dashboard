/**
 * POST /api/sync/run — triggers a Zoho → PostgreSQL invoice sync.
 *
 * Query params:
 *   mode=incremental (default) — last 90 days, fast (~30s)
 *   mode=full                  — from 2023-01-01, slower (initial setup)
 *
 * Protected by CRON_SECRET header — same secret as the cron warm endpoint.
 * Can also be called from the "Sync Now" button (no secret needed from browser
 * since the user is already authenticated via session).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { runSync, SyncMode } from '@/lib/zoho-sync'
import { getCachedAllPL, getCachedAllBS, getCachedAllCF } from '@/lib/financial-cache'
import { getCachedDashboard } from '@/lib/cache'
import type { FinancialPeriod } from '@/types/financials'
import type { PeriodDef } from '@/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

/**
 * Sync Now — refreshes data for ALL THREE tabs across ALL entities:
 *   1. Invoices  → synced_invoices table     (AR Dashboard + Executive Summary AR)
 *   2. PL/BS/CF  → cache_store (force=true)   (Financial Statements + Exec financials)
 *   3. AR cache  → cache_store (force=true)   (Dashboard fallback path)
 */
export async function POST(req: Request) {
  const auth    = req.headers.get('authorization')
  const session = await getSession()

  if (!session && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp   = new URL(req.url).searchParams
  const mode = (sp.get('mode') ?? 'incremental') as SyncMode

  const t0   = Date.now()
  const year = new Date().getFullYear()
  const finPeriod: FinancialPeriod = { mode: 'year', year, comparison: 'previous' }
  const arPeriod:  PeriodDef       = { mode: 'ytd',  year, comparison: 'previous' }

  // Run invoice sync + financial warm + AR warm concurrently
  const [results] = await Promise.all([
    runSync(mode),
    getCachedAllPL(finPeriod, true).catch((e) => { console.error('PL warm:', e.message) }),
    getCachedAllBS(finPeriod, true).catch((e) => { console.error('BS warm:', e.message) }),
    getCachedAllCF(finPeriod, true).catch((e) => { console.error('CF warm:', e.message) }),
    getCachedDashboard(arPeriod, true).catch((e) => { console.error('AR warm:', e.message) }),
  ])

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  const ok      = results.every((r) => r.status === 'ok')
  const total   = results.reduce((s, r) => s + r.count, 0)

  return NextResponse.json({
    ok,
    mode,
    elapsed: `${elapsed}s`,
    totalInvoices: total,
    orgs: results,
  })
}

// Also support GET for cron job compatibility
export async function GET(req: Request) {
  return POST(req)
}
