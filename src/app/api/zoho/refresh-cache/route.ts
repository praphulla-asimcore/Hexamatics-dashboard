import { NextRequest, NextResponse } from 'next/server'
import { getCachedDashboard, invalidateCache } from '@/lib/cache'
import { getDefaultPeriod } from '@/lib/zoho-data'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (process.env.NODE_ENV === 'production' && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Refreshing dashboard cache...')
    const period = getDefaultPeriod()
    invalidateCache(period)
    const data = await getCachedDashboard(period, true)

    return NextResponse.json({
      ok: true,
      refreshedAt: data.lastRefreshed,
      period: data.periodLabel,
      entitiesLoaded: data.entities.length,
      groupRevenueMyr: data.group.totalMyr,
    })
  } catch (err: any) {
    console.error('[Cron] Cache refresh failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
