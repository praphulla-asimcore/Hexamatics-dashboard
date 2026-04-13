import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCachedAnnualData } from '@/lib/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const fromYear = parseInt(searchParams.get('fromYear') || '2023')
    const forceRefresh = searchParams.get('refresh') === 'true'

    const data = await getCachedAnnualData(fromYear, forceRefresh)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    })
  } catch (err: any) {
    console.error('Annual API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
