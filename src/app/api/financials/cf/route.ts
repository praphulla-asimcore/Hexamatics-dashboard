import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCachedCF, getCachedAllCF } from '@/lib/financial-cache'
import { buildConsolidatedCF, generateCFInsights } from '@/lib/financial-analytics'
import type { FinancialPeriod } from '@/types/financials'

export const dynamic = 'force-dynamic'

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
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const period = parsePeriod(sp)
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
