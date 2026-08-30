import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { getCachedCF, getCachedAllCF } from '@/lib/financial-cache'
import { buildConsolidatedCF, generateCFInsights } from '@/lib/financial-analytics'
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
      const statement = await getCachedCF(orgId, period, force)
      return NextResponse.json({ statement }, {
        headers: { 'Cache-Control': 'private, max-age=1800' },
      })
    }

    const entities = await getCachedAllCF(period, force)
    const consolidated = buildConsolidatedCF(entities)
    const insights = generateCFInsights(consolidated)

    return NextResponse.json(
      { consolidated, insights, lastRefreshed: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=1800' } }
    )
  } catch (err: any) {
    console.error('CF API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
