import { NextRequest, NextResponse } from 'next/server'
import { getCachedDashboard, invalidateCache } from '@/lib/cache'
import { getDefaultPeriod } from '@/lib/zoho-data'
import { isValidCronSecret } from '@/lib/cron-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')

  if (!isValidCronSecret(authHeader)) {
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
