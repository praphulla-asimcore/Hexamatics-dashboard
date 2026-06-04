import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCachedDashboard } from '@/lib/cache'
import { getDashboardFromDB } from '@/lib/db-dashboard'
import type { PeriodDef, ComparisonMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sp         = new URL(req.url).searchParams
    const mode       = (sp.get('mode') || 'ytd') as PeriodDef['mode']
    const year       = parseInt(sp.get('year') || String(new Date().getFullYear()))
    const month      = sp.get('month')   ? parseInt(sp.get('month')!)   : undefined
    const quarter    = sp.get('quarter') ? (parseInt(sp.get('quarter')!) as 1|2|3|4) : undefined
    const half       = sp.get('half')    ? (parseInt(sp.get('half')!)   as 1|2) : undefined
    const comparison = (sp.get('comparison') || 'previous') as ComparisonMode
    const forceRefresh = sp.get('force') === '1' || sp.get('refresh') === 'true'
    const customFrom = sp.get('customFrom') ?? undefined
    const customTo   = sp.get('customTo')   ?? undefined

    const period: PeriodDef = { mode, year, month, quarter, half, comparison, customFrom, customTo }

    // 1. Try synced PostgreSQL data (instant — no Zoho API calls)
    if (!forceRefresh) {
      const dbData = await getDashboardFromDB(period)
      if (dbData) {
        return NextResponse.json(dbData, {
          headers: { 'Cache-Control': 'private, max-age=60' },
        })
      }
    }

    // 2. Fall back to Zoho via cache (first time or force refresh)
    const data = await getCachedDashboard(period, forceRefresh)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err: any) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
