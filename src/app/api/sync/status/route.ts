import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSyncStatus } from '@/lib/zoho-sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = await getSyncStatus()
  return NextResponse.json(status)
}
