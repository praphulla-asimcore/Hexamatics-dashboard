import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCachedDashboard } from '@/lib/cache'
import type { PeriodDef, ComparisonMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const mode = (searchParams.get('mode') || 'month') as PeriodDef['mode']
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined
    const quarter = searchParams.get('quarter')
      ? (parseInt(searchParams.get('quarter')!) as 1 | 2 | 3 | 4)
      : undefined
    const half = searchParams.get('half')
      ? (parseInt(searchParams.get('half')!) as 1 | 2)
      : undefined
    const comparison = (searchParams.get('comparison') || 'previous') as ComparisonMode
    const forceRefresh = searchParams.get('refresh') === 'true'

    const period: PeriodDef = { mode, year, month, quarter, half, comparison }
    const data = await getCachedDashboard(period, forceRefresh)

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err: any) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
