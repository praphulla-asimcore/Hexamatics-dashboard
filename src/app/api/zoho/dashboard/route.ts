import { NextRequest, NextResponse } from 'next/server'
import { getCachedGroupSummary } from '@/lib/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || '2026')
    const monthsParam = searchParams.get('months') || '1,2'
    const months = monthsParam.split(',').map(Number)
    const forceRefresh = searchParams.get('refresh') === 'true'

    const data = await getCachedGroupSummary(year, months, forceRefresh)

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err: any) {
    console.error('Dashboard API error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
