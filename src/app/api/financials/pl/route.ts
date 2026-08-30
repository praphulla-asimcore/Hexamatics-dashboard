import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { getCachedPL, getCachedAllPL } from '@/lib/financial-cache'
import {
  buildConsolidatedPL,
  generatePLInsights,
} from '@/lib/financial-analytics'
import { getFinancialPeriodLabel, parsePeriodFromParams } from '@/lib/financial-period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds — bulk fetch can take 20-50 s cold

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const parsed = parsePeriodFromParams(sp)
  if (!parsed.period) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const period = parsed.period
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
