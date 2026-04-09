import { NextRequest, NextResponse } from 'next/server'
import { getCachedGroupSummary } from '@/lib/cache'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Verify this is a Vercel cron call (or our own secret)
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (process.env.NODE_ENV === 'production' && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Refreshing Zoho Books cache...')
    const data = await getCachedGroupSummary(2026, [1, 2], true)

    return NextResponse.json({
      ok: true,
      refreshedAt: data.lastRefreshed,
      entitiesLoaded: data.entities.length,
      groupRevenueMyr: data.group.ytd,
    })
  } catch (err: any) {
    console.error('[Cron] Cache refresh failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
