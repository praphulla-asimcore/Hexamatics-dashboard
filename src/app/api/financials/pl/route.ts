import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { getCachedPL, getCachedAllPL } from '@/lib/financial-cache'
import {
  buildConsolidatedPL,
  generatePLInsights,
} from '@/lib/financial-analytics'
import {
  getFinancialDateRange,
  getFinancialPeriodLabel,
} from '@/lib/zoho-reports'
import type { FinancialPeriod } from '@/types/financials'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds — bulk fetch can take 20-50 s cold

function parsePeriod(sp: URLSearchParams): FinancialPeriod {
  const mode = (sp.get('mode') ?? 'month') as FinancialPeriod['mode']
  const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
  const month = sp.has('month') ? parseInt(sp.get('month')!) : undefined
  const quarter = sp.has('quarter') ? (parseInt(sp.get('quarter')!) as 1|2|3|4) : undefined
  const half = sp.has('half') ? (parseInt(sp.get('half')!) as 1|2) : undefined
  const comparison = (sp.get('comparison') ?? 'previous') as FinancialPeriod['comparison']
  return { mode, year, month, quarter, half, comparison }
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const period = parsePeriod(sp)
  const orgId = sp.get('orgId') // null → all entities
  const force = sp.get('force') === '1'

  try {
    if (orgId) {
      // Single entity
      const statement = await getCachedPL(orgId, period, force)
      return NextResponse.json({ statement }, {
        headers: { 'Cache-Control': 'private, max-age=1800' },
      })
    }

    // All entities → consolidated
    const entities = await getCachedAllPL(period, force)
    const periodLabel = getFinancialPeriodLabel(period)
    const consolidated = buildConsolidatedPL(entities, periodLabel)
    const insights = generatePLInsights(consolidated)

    return NextResponse.json(
      { consolidated, insights, lastRefreshed: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=1800' } }
    )
  } catch (err: any) {
    console.error('P&L API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
