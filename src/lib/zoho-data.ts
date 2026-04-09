import { zohoFetch } from './zoho-auth'
import { ORGS } from './orgs'
import type {
  ZohoInvoice,
  EntitySummary,
  DashboardData,
  PeriodDef,
  PeriodSummary,
  ArAging,
  TopCustomer,
  OrgConfig,
  MonthDataPoint,
  FinancialRatios,
  GroupSummary,
} from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

// ─── Period helpers ───────────────────────────────────────────────────────────

export function getPeriodDateRange(period: PeriodDef): { from: string; to: string } {
  const { mode, year, month, quarter } = period

  if (mode === 'month' && month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    return { from, to }
  }

  if (mode === 'quarter' && quarter) {
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = quarter * 3
    const from = `${year}-${String(startMonth).padStart(2, '0')}-01`
    const lastDay = new Date(year, endMonth, 0).getDate()
    const to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
    return { from, to }
  }

  // YTD: Jan 1 → last complete month (or Dec for past years)
  const now = new Date()
  const endMonth = year < now.getFullYear()
    ? 12
    : Math.max(now.getMonth(), 1) // getMonth() is 0-indexed; if Jan, show Jan
  const from = `${year}-01-01`
  const lastDay = new Date(year, endMonth, 0).getDate()
  const to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

export function getPeriodLabel(period: PeriodDef): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (period.mode === 'month' && period.month) return `${MONTHS[period.month - 1]} ${period.year}`
  if (period.mode === 'quarter' && period.quarter) return `Q${period.quarter} ${period.year}`
  return `YTD ${period.year}`
}

export function getPreviousPeriod(period: PeriodDef): PeriodDef {
  if (period.mode === 'month') {
    const m = period.month!
    return m === 1
      ? { mode: 'month', year: period.year - 1, month: 12 }
      : { mode: 'month', year: period.year, month: m - 1 }
  }
  if (period.mode === 'quarter') {
    const q = period.quarter!
    return q === 1
      ? { mode: 'quarter', year: period.year - 1, quarter: 4 }
      : { mode: 'quarter', year: period.year, quarter: (q - 1) as 1 | 2 | 3 | 4 }
  }
  return { mode: 'ytd', year: period.year - 1 }
}

export function getDefaultPeriod(): PeriodDef {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-indexed
  // Default to current month; if it's the 1st few days, show previous month
  return { mode: 'month', year: now.getFullYear(), month }
}

function getLast12MonthsRange(period: PeriodDef): { from: string; to: string } {
  const { to } = getPeriodDateRange(period)
  const toDate = new Date(to)
  // 12 months back from end of period
  const fromDate = new Date(toDate.getFullYear(), toDate.getMonth() - 11, 1)
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-01`
  return { from, to }
}

// ─── Fetch invoices ───────────────────────────────────────────────────────────

async function fetchOrgInvoices(
  orgId: string,
  from: string,
  to: string
): Promise<ZohoInvoice[]> {
  const allInvoices: ZohoInvoice[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data: any = await zohoFetch('/invoices', {
      organization_id: orgId,
      sort_column: 'date',
      sort_order: 'D',
      per_page: '200',
      page: String(page),
      filter_by: 'Status.All',
    })

    const invoices: ZohoInvoice[] = data.invoices || []
    const inRange = invoices.filter((inv) => inv.date >= from && inv.date <= to)
    allInvoices.push(...inRange)

    const hasOlder = invoices.some((inv) => inv.date < from)
    hasMore = !hasOlder && (data.page_context?.has_more_page ?? false)
    page++
    if (page > 30) break
  }

  return allInvoices
}

// ─── Build summaries ──────────────────────────────────────────────────────────

function buildPeriodSummary(invoices: ZohoInvoice[], fxToMyr: number): PeriodSummary {
  const total = invoices.reduce((s, inv) => s + inv.total, 0)
  const outstanding = invoices.reduce((s, inv) => s + inv.balance, 0)
  const collected = total - outstanding
  const statusBreakdown: Record<string, number> = {}
  invoices.forEach((inv) => {
    statusBreakdown[inv.status] = (statusBreakdown[inv.status] || 0) + 1
  })
  return {
    count: invoices.length,
    total,
    collected,
    outstanding,
    totalMyr: total * fxToMyr,
    statusBreakdown,
  }
}

function buildArAging(invoices: ZohoInvoice[]): ArAging {
  const today = new Date()
  const aging: ArAging = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }

  invoices
    .filter((inv) => inv.balance > 0)
    .forEach((inv) => {
      const due = parseISO(inv.due_date || inv.date)
      const daysPast = differenceInDays(today, due)
      if (daysPast <= 0) aging.current += inv.balance
      else if (daysPast <= 30) aging.days1to30 += inv.balance
      else if (daysPast <= 60) aging.days31to60 += inv.balance
      else if (daysPast <= 90) aging.days61to90 += inv.balance
      else aging.days90plus += inv.balance
    })

  return aging
}

function buildTopCustomers(invoices: ZohoInvoice[]): TopCustomer[] {
  const map: Record<string, TopCustomer> = {}
  invoices.forEach((inv) => {
    if (!map[inv.customer_name]) {
      map[inv.customer_name] = {
        name: inv.customer_name,
        total: 0,
        outstanding: 0,
        invoiceCount: 0,
      }
    }
    map[inv.customer_name].total += inv.total
    map[inv.customer_name].outstanding += inv.balance
    map[inv.customer_name].invoiceCount++
  })
  return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
}

function buildRatios(
  period: PeriodSummary,
  arAging: ArAging,
  topCustomers: TopCustomer[],
  daysInPeriod: number
): FinancialRatios {
  const collectionRate = period.total > 0 ? (period.collected / period.total) * 100 : 0
  const dso = period.total > 0 ? (period.outstanding / period.total) * daysInPeriod : 0
  const totalAr = arAging.current + arAging.days1to30 + arAging.days31to60 + arAging.days61to90 + arAging.days90plus
  const overdueAr = arAging.days1to30 + arAging.days31to60 + arAging.days61to90 + arAging.days90plus
  const overdueRatio = totalAr > 0 ? (overdueAr / totalAr) * 100 : 0
  const top1 = topCustomers.length > 0 ? topCustomers[0].total : 0
  const topCustomerConc = period.total > 0 ? (top1 / period.total) * 100 : 0
  const avgInvoiceValue = period.count > 0 ? period.total / period.count : 0

  return { collectionRate, dso, overdueRatio, topCustomerConc, avgInvoiceValue }
}

function buildMonthlyTrend(invoices: ZohoInvoice[], fxToMyr: number): MonthDataPoint[] {
  const byMonth: Record<string, MonthDataPoint> = {}
  invoices.forEach((inv) => {
    const [y, m] = inv.date.split('-').map(Number)
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (!byMonth[key]) {
      byMonth[key] = { year: y, month: m, totalLocal: 0, totalMyr: 0, collected: 0, outstanding: 0, count: 0 }
    }
    byMonth[key].totalLocal += inv.total
    byMonth[key].totalMyr += inv.total * fxToMyr
    byMonth[key].collected += inv.total - inv.balance
    byMonth[key].outstanding += inv.balance
    byMonth[key].count++
  })
  return Object.values(byMonth).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  )
}

// ─── Per-entity fetch ─────────────────────────────────────────────────────────

async function fetchEntityData(
  org: OrgConfig,
  periodRange: { from: string; to: string },
  comparisonRange: { from: string; to: string } | null,
  trendRange: { from: string; to: string },
  daysInPeriod: number
): Promise<EntitySummary> {
  // Determine the widest date range needed
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

  let allInvoices: ZohoInvoice[] = []
  try {
    allInvoices = await fetchOrgInvoices(org.id, wideFrom, wideTo)
  } catch (err) {
    console.error(`Failed to fetch ${org.name}:`, err)
  }

  const periodInvoices = allInvoices.filter(
    (inv) => inv.date >= periodRange.from && inv.date <= periodRange.to
  )
  const compInvoices = comparisonRange
    ? allInvoices.filter((inv) => inv.date >= comparisonRange.from && inv.date <= comparisonRange.to)
    : null
  const trendInvoices = allInvoices.filter(
    (inv) => inv.date >= trendRange.from && inv.date <= trendRange.to
  )

  const period = buildPeriodSummary(periodInvoices, org.fxToMyr)
  const comparison = compInvoices ? buildPeriodSummary(compInvoices, org.fxToMyr) : undefined
  const arAging = buildArAging(periodInvoices)
  const topCustomers = buildTopCustomers(periodInvoices)
  const ratios = buildRatios(period, arAging, topCustomers, daysInPeriod)
  const monthlyTrend = buildMonthlyTrend(trendInvoices, org.fxToMyr)

  return { org, period, comparison, arAging, topCustomers, ratios, monthlyTrend }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchDashboard(
  period: PeriodDef,
  includeComparison = true
): Promise<DashboardData> {
  const periodRange = getPeriodDateRange(period)
  const prevPeriod = getPreviousPeriod(period)
  const comparisonRange = includeComparison ? getPeriodDateRange(prevPeriod) : null
  const trendRange = getLast12MonthsRange(period)

  const fromDate = new Date(periodRange.from)
  const toDate = new Date(periodRange.to)
  const daysInPeriod = differenceInDays(toDate, fromDate) + 1

  const entities = await Promise.all(
    ORGS.map((org) => fetchEntityData(org, periodRange, comparisonRange, trendRange, daysInPeriod))
  )

  const sumMyr = (fn: (e: EntitySummary) => number) =>
    entities.reduce((s, e) => s + fn(e), 0)

  const totalMyr = sumMyr((e) => e.period.totalMyr)
  const collectedMyr = sumMyr((e) => e.period.collected * e.org.fxToMyr)
  const outstandingMyr = sumMyr((e) => e.period.outstanding * e.org.fxToMyr)
  const collectionRate = totalMyr > 0 ? (collectedMyr / totalMyr) * 100 : 0
  const invoiceCount = sumMyr((e) => e.period.count)

  const compTotalMyr = includeComparison ? sumMyr((e) => e.comparison?.totalMyr ?? 0) : undefined
  const compCollectedMyr = includeComparison
    ? sumMyr((e) => (e.comparison?.collected ?? 0) * e.org.fxToMyr)
    : undefined
  const comparisonCollectionRate =
    compTotalMyr && compTotalMyr > 0
      ? ((compCollectedMyr ?? 0) / compTotalMyr) * 100
      : undefined

  const group: GroupSummary = {
    totalMyr,
    collectedMyr,
    outstandingMyr,
    collectionRate,
    invoiceCount,
    comparisonTotalMyr: compTotalMyr,
    comparisonCollectionRate,
  }

  return {
    entities,
    group,
    periodLabel: getPeriodLabel(period),
    comparisonLabel: includeComparison ? getPeriodLabel(prevPeriod) : '',
    lastRefreshed: new Date().toISOString(),
    dateRange: periodRange,
  }
}

// Legacy compat
export { getPeriodDateRange as getDateRange }
