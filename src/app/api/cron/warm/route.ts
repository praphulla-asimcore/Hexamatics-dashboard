/**
 * Cache warm-up cron job — called every 3 hours by Vercel Cron.
 *
 * Fetches PL, BS, CF for all 9 orgs and writes to Vercel KV so that
 * every user Lambda instance sees a warm cache on arrival.
 *
 * Setup:
 *   1. Vercel dashboard → Storage → Create KV Store → Connect to this project
 *   2. Add env var CRON_SECRET (any random string, e.g. openssl rand -hex 32)
 *   3. Set the same CRON_SECRET in Vercel project settings → Environment Variables
 */

import { NextResponse } from 'next/server'
import { getCachedAllPL, getCachedAllBS, getCachedAllCF } from '@/lib/financial-cache'
import { getCachedDashboard } from '@/lib/cache'
import type { FinancialPeriod } from '@/types/financials'
import type { PeriodDef } from '@/types'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300 // 5 min — enough for 27 sequential Zoho calls

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (or an authorised caller)
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const year = new Date().getFullYear()

  const finPeriod: FinancialPeriod = { mode: 'year', year, comparison: 'previous' }
  const arPeriod:  PeriodDef       = { mode: 'ytd',  year, comparison: 'previous' }

  const started = Date.now()

  try {
    // PL, BS, CF run in parallel across 3 concurrent Promise chains.
    // Each chain is sequential per-org internally (rate limiter enforced).
    // AR data is a single fast call.
    await Promise.all([
      getCachedAllPL(finPeriod, true),
      getCachedAllBS(finPeriod, true),
      getCachedAllCF(finPeriod, true),
      getCachedDashboard(arPeriod, true),
    ])

    return NextResponse.json({
      ok:      true,
      year,
      elapsed: `${((Date.now() - started) / 1000).toFixed(1)}s`,
      warmed:  new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[cron/warm] failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
