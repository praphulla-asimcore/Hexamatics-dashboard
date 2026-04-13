import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { getCachedBS, getCachedAllBS } from '@/lib/financial-cache'
import { buildConsolidatedBS, generateBSInsights } from '@/lib/financial-analytics'
import type { FinancialPeriod } from '@/types/financials'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  const orgId = sp.get('orgId')
  const force = sp.get('force') === '1'

  try {
    if (orgId) {
      const statement = await getCachedBS(orgId, period, force)
      return NextResponse.json({ statement }, {
        headers: { 'Cache-Control': 'private, max-age=1800' },
      })
    }

    const entities = await getCachedAllBS(period, force)
    const asOfDate = entities[0]?.asOfDate ?? ''
    const consolidated = buildConsolidatedBS(entities, asOfDate)
    const insights = generateBSInsights(consolidated)

    return NextResponse.json(
      { consolidated, insights, lastRefreshed: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=1800' } }
    )
  } catch (err: any) {
    console.error('BS API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
