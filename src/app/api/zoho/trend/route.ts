import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'
import { fetchDashboardTrend } from '@/lib/zoho-data'
import { pgGet, pgSet } from '@/lib/pg-cache'
import type { PeriodDef } from '@/types'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp     = new URL(req.url).searchParams
  const mode   = (sp.get('mode') ?? 'ytd') as PeriodDef['mode']
  const year   = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
  const force  = sp.get('force') === '1'
  const period: PeriodDef = { mode, year, comparison: 'none' }

  const cacheKey = `ar:trend:${mode}_${year}`

  if (!force) {
    const cached = await pgGet<number[][][]>(cacheKey)
    if (cached) return NextResponse.json({ trend: cached })
  }

  const trend = await fetchDashboardTrend(period)
  await pgSet(cacheKey, trend, 4 * 60 * 60) // 4h TTL same as main data

  return NextResponse.json({ trend }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
