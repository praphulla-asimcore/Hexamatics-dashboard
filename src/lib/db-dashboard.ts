/**
 * Builds DashboardData from synced_invoices (PostgreSQL) instead of Zoho.
 * Called by /api/zoho/dashboard when sync data is available and fresh.
 */

import { getPool } from './pg'
import { ORGS, ORG_MAP } from './orgs'
import { differenceInDays, parseISO } from 'date-fns'
import {
  getPeriodDateRange,
  getComparisonPeriod,
  getPeriodLabel,
  getLast12MonthsRange,
} from './zoho-data'
import {
  classifyInvoices,
  buildPeriodSummary,
  buildArAging,
  buildTopCustomers,
  buildRatios,
  buildMonthlyTrend,
  buildSegmentSummary,
} from './zoho-data'
import { getSyncStatus } from './zoho-sync'
import type {
  DashboardData, EntitySummary, GroupSummary, SegmentSummary,
  PeriodDef, ZohoInvoice,
} from '@/types'

// Max age before synced data is considered too old to trust. The daily cron
// (+ manual Sync Now) keeps it current, so this only triggers a Zoho fallback
// if sync has been broken for a week.
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function getInvoicesFromDB(
  from: string,
  to: string
): Promise<{ orgId: string; inv: ZohoInvoice }[]> {
  const pool = getPool()
  if (!pool) return []

  const res = await pool.query<{
    invoice_id: string; org_id: string; customer_name: string
    date: string; due_date: string | null; status: string
    total: string; balance: string; currency: string
  }>(
    `SELECT invoice_id, org_id, customer_name, date, due_date,
            status, total, balance, currency
     FROM synced_invoices
     WHERE date >= $1 AND date <= $2`,
    [from, to]
  )

  return res.rows.map((r) => ({
    orgId: r.org_id,
    inv: {
      invoice_id:    r.invoice_id,
      invoice_number: r.invoice_id,
      customer_name:  r.customer_name,
      date:           r.date.slice(0, 10),
      due_date:       r.due_date?.slice(0, 10) ?? r.date.slice(0, 10),
      status:         r.status as ZohoInvoice['status'],
      total:          Number(r.total),
      balance:        Number(r.balance),
      currency_code:  r.currency,
      exchange_rate:  1,
    },
  }))
}

export async function getDashboardFromDB(
  period: PeriodDef
): Promise<DashboardData | null> {
  const pool = getPool()
  if (!pool) return null

  // Only use DB data if all orgs have been synced recently
  const syncStatus = await getSyncStatus()
  if (!syncStatus.isReady || !syncStatus.oldestSync) return null
  if (Date.now() - new Date(syncStatus.oldestSync).getTime() > MAX_STALE_MS) return null

  try {
    const periodRange     = getPeriodDateRange(period)
    const compPeriod      = period.comparison !== 'none' ? getComparisonPeriod(period) : null
    const comparisonRange = compPeriod ? getPeriodDateRange(compPeriod) : null
    const trendRange      = getLast12MonthsRange(period)

    const fromDate    = new Date(periodRange.from)
    const toDate      = new Date(periodRange.to)
    const daysInPeriod = differenceInDays(toDate, fromDate) + 1

    // Wide range covers period + comparison + trend
    const wideFrom = [
      periodRange.from,
      comparisonRange?.from ?? periodRange.from,
      trendRange.from,
    ].sort()[0]
    const wideTo = [
      periodRange.to,
      comparisonRange?.to ?? periodRange.to,
      trendRange.to,
    ].sort().reverse()[0]

    const rows = await getInvoicesFromDB(wideFrom, wideTo)

    // Group by org
    const byOrg = new Map<string, ZohoInvoice[]>()
    for (const { orgId, inv } of rows) {
      if (!byOrg.has(orgId)) byOrg.set(orgId, [])
      byOrg.get(orgId)!.push(inv)
    }

    const entities: EntitySummary[] = ORGS.map((org) => {
      const all = byOrg.get(org.id) ?? []

      const period3P = classifyInvoices(
        all.filter((inv) => inv.date >= periodRange.from && inv.date <= periodRange.to)
      )
      const comp3P = comparisonRange
        ? classifyInvoices(all.filter((inv) => inv.date >= comparisonRange!.from && inv.date <= comparisonRange!.to))
        : null
      const trend3P = classifyInvoices(
        all.filter((inv) => inv.date >= trendRange.from && inv.date <= trendRange.to)
      )

      const periodSum    = buildPeriodSummary(period3P.thirdParty, org.fxToMyr)
      const comparison   = comp3P ? buildPeriodSummary(comp3P.thirdParty, org.fxToMyr) : undefined
      const arAging      = buildArAging(period3P.thirdParty)
      const topCustomers = buildTopCustomers(period3P.thirdParty)
      const ratios       = buildRatios(periodSum, arAging, topCustomers, daysInPeriod)
      const monthlyTrend = buildMonthlyTrend(trend3P.thirdParty, org.fxToMyr)
      const interco      = period3P.interco.length > 0 ? buildSegmentSummary(period3P.interco, org.fxToMyr) : undefined
      const rpt          = period3P.rpt.length > 0 ? buildSegmentSummary(period3P.rpt, org.fxToMyr) : undefined

      return { org, period: periodSum, comparison, arAging, topCustomers, ratios, monthlyTrend, interco, rpt }
    })

    const sumMyr = (fn: (e: EntitySummary) => number) =>
      entities.reduce((s, e) => s + fn(e), 0)

    const totalMyr       = sumMyr((e) => e.period.totalMyr)
    const collectedMyr   = sumMyr((e) => e.period.collected * e.org.fxToMyr)
    const outstandingMyr = sumMyr((e) => e.period.outstanding * e.org.fxToMyr)
    const collectionRate = totalMyr > 0 ? (collectedMyr / totalMyr) * 100 : 0
    const invoiceCount   = sumMyr((e) => e.period.count)

    const compTotalMyr     = compPeriod ? sumMyr((e) => e.comparison?.totalMyr ?? 0) : undefined
    const compCollectedMyr = compPeriod ? sumMyr((e) => (e.comparison?.collected ?? 0) * e.org.fxToMyr) : undefined
    const comparisonCollectionRate =
      compTotalMyr && compTotalMyr > 0 ? ((compCollectedMyr ?? 0) / compTotalMyr) * 100 : undefined

    const group: GroupSummary = {
      totalMyr, collectedMyr, outstandingMyr, collectionRate, invoiceCount,
      comparisonTotalMyr: compTotalMyr,
      comparisonCollectionRate,
    }

    const sumSegment = (key: 'interco' | 'rpt'): SegmentSummary | undefined => {
      const segs = entities.map((e) => e[key]).filter(Boolean) as SegmentSummary[]
      if (!segs.length) return undefined
      const topMap: Record<string, any> = {}
      segs.forEach((s) => s.topCustomers.forEach((c) => {
        if (!topMap[c.name]) topMap[c.name] = { ...c }
        else { topMap[c.name].total += c.total; topMap[c.name].outstanding += c.outstanding; topMap[c.name].invoiceCount += c.invoiceCount }
      }))
      return {
        totalMyr:       segs.reduce((s, e) => s + e.totalMyr, 0),
        outstandingMyr: segs.reduce((s, e) => s + e.outstandingMyr, 0),
        collectedMyr:   segs.reduce((s, e) => s + e.collectedMyr, 0),
        invoiceCount:   segs.reduce((s, e) => s + e.invoiceCount, 0),
        topCustomers:   Object.values(topMap).sort((a: any, b: any) => b.total - a.total).slice(0, 10),
      }
    }

    return {
      entities,
      group,
      intercoGroup: sumSegment('interco'),
      rptGroup:     sumSegment('rpt'),
      periodLabel:  getPeriodLabel(period),
      comparisonLabel: compPeriod ? getPeriodLabel(compPeriod) : '',
      lastRefreshed:   syncStatus.oldestSync!,
      dateRange:       periodRange,
    }
  } catch (err) {
    console.error('[db-dashboard] error:', err)
    return null
  }
}
