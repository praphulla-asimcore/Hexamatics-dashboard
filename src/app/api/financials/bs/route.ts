import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { getCachedBS, getCachedAllBS } from '@/lib/financial-cache'
import { buildConsolidatedBS, generateBSInsights } from '@/lib/financial-analytics'
import { parsePeriodFromParams } from '@/lib/financial-period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const parsed = parsePeriodFromParams(sp)
  if (!parsed.period) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const period = parsed.period
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
