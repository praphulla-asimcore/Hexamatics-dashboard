/**
 * Debug endpoint — shows raw Zoho Reports API responses.
 * Admin-only. Use to diagnose scope/format issues.
 *
 * GET /api/financials/debug?report=pl|bs|cf&orgId=762447369&from=2025-01-01&to=2025-03-31
 */

import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { zohoFetch } from '@/lib/zoho-auth'
import { getAccessToken } from '@/lib/zoho-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const sp = new URL(req.url).searchParams
  const report = sp.get('report') ?? 'pl'
  const orgId = sp.get('orgId') ?? '762447369' // Servcomm MY as default
  const from = sp.get('from') ?? '2025-01-01'
  const to = sp.get('to') ?? '2025-03-31'

  const results: Record<string, any> = {}

  // 1. Verify the access token works
  try {
    const token = await getAccessToken()
    results.token_ok = true
    results.token_prefix = token.substring(0, 20) + '...'
  } catch (err: any) {
    results.token_error = err.message
    return NextResponse.json(results, { status: 200 })
  }

  // 2. Try the requested report
  if (report === 'pl') {
    try {
      const raw = await zohoFetch('/reports/profitandloss', {
        organization_id: orgId,
        from_date: from,
        to_date: to,
        basis: 'Accrual',
      })
      results.pl_response = raw
      results.pl_top_keys = Object.keys(raw as any)
    } catch (err: any) {
      results.pl_error = err.message
    }
  }

  if (report === 'bs') {
    try {
      const raw = await zohoFetch('/reports/balancesheet', {
        organization_id: orgId,
        as_of_date: to,
        basis: 'Accrual',
      })
      results.bs_response = raw
      results.bs_top_keys = Object.keys(raw as any)
    } catch (err: any) {
      results.bs_error = err.message
    }
  }

  if (report === 'cf') {
    try {
      const raw = await zohoFetch('/reports/cashflow', {
        organization_id: orgId,
        from_date: from,
        to_date: to,
      })
      results.cf_response = raw
      results.cf_top_keys = Object.keys(raw as any)
    } catch (err: any) {
      results.cf_error = err.message
    }
  }

  return NextResponse.json(results, { status: 200 })
}
