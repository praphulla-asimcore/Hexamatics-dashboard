/**
 * POST /api/sync/run — Zoho → PostgreSQL sync for ALL THREE tabs.
 *
 * Phases run SEQUENTIALLY (not concurrent) so they don't starve each other
 * on the shared Zoho rate limiter:
 *   1. Invoices  → synced_invoices   (AR Dashboard + Executive Summary AR)
 *   2. PL/BS/CF  → cache_store        (Financial Statements + Exec financials)
 *
 * Financials are warmed for the common quick-select periods (current month,
 * YTD, full year). Custom date ranges are fetched live on first view, then
 * cached for 7 days.
 *
 * Query params:
 *   mode=incremental (default) | full
 *   scope=all (default) | invoices | financials
 *
 * Auth: logged-in session OR Bearer CRON_SECRET (for the daily cron).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { runSync, SyncMode } from '@/lib/zoho-sync'
import { getCachedAllPL, getCachedAllBS, getCachedAllCF } from '@/lib/financial-cache'
import type { FinancialPeriod } from '@/types/financials'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

async function warmFinancials(): Promise<string[]> {
  const year = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  const warmed: string[] = []

  // Periods that map to the quick-select buttons users actually click
  const periods: FinancialPeriod[] = [
    { mode: 'year', year, comparison: 'previous' },
    { mode: 'year', year, comparison: 'none' },
    { mode: 'month', year, month, comparison: 'previous' },
  ]

  for (const p of periods) {
    try {
      // Calls share the global rate limiter, so this is effectively serial
      await Promise.all([
        getCachedAllPL(p, true),
        getCachedAllBS(p, true),
        getCachedAllCF(p, true),
      ])
      warmed.push(`${p.mode}:${p.comparison}`)
    } catch (e: any) {
      console.error(`financial warm ${p.mode}/${p.comparison}:`, e.message)
    }
  }
  return warmed
}

export async function POST(req: Request) {
  const auth    = req.headers.get('authorization')
  const session = await getSession()
  if (!session && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp    = new URL(req.url).searchParams
  const mode  = (sp.get('mode')  ?? 'incremental') as SyncMode
  const scope = (sp.get('scope') ?? 'all') as 'all' | 'invoices' | 'financials'

  const t0 = Date.now()
  let invoiceResults: Awaited<ReturnType<typeof runSync>> = []
  let warmedPeriods: string[] = []

  // Phase 1 — invoices (skip if financials-only)
  if (scope !== 'financials') {
    invoiceResults = await runSync(mode)
  }

  // Phase 2 — financial reports (skip if invoices-only)
  if (scope !== 'invoices') {
    warmedPeriods = await warmFinancials()
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  const ok      = invoiceResults.every((r) => r.status === 'ok')
  const total   = invoiceResults.reduce((s, r) => s + r.count, 0)

  return NextResponse.json({
    ok,
    mode,
    scope,
    elapsed: `${elapsed}s`,
    totalInvoices: total,
    warmedPeriods,
    orgs: invoiceResults,
  })
}

export async function GET(req: Request) {
  return POST(req)
}
