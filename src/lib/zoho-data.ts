import { zohoFetch } from './zoho-auth'
import { ORGS } from './orgs'
import { getCustomerType } from './customer-classification'
import type {
  ZohoInvoice,
  EntitySummary,
  DashboardData,
  PeriodDef,
  PeriodSummary,
  SegmentSummary,
  ArAging,
  TopCustomer,
  OrgConfig,
  MonthDataPoint,
  FinancialRatios,
  GroupSummary,
  AnnualEntityRow,
  AnnualYearData,
} from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

// ─── Period helpers ───────────────────────────────────────────────────────────

export function getPeriodDateRange(period: PeriodDef): { from: string; to: string } {
  const { mode, year, month, quarter, half } = period
  const now = new Date()

  if (mode === 'custom' && period.customFrom && period.customTo) {
    return { from: period.customFrom, to: period.customTo }
  }

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

  if (mode === 'half') {
    const h = half ?? 1
    const startMonth = h === 1 ? 1 : 7
    const endMonth = h === 1 ? 6 : 12
    const from = `${year}-${String(startMonth).padStart(2, '0')}-01`
    const lastDay = new Date(year, endMonth, 0).getDate()
    const to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
    return { from, to }
  }

  if (mode === 'year') {
    const from = `${year}-01-01`
    const endMonth = year < now.getFullYear() ? 12 : Math.max(now.getMonth() + 1, 1)
    const lastDay = new Date(year, endMonth, 0).getDate()
    const to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
    return { from, to }
  }

  if (mode === 'rolling12') {
    // Trailing 12 months ending at end of last complete month
    const endM = now.getMonth() === 0 ? 12 : now.getMonth() // last complete month (0-indexed month = previous month)
    const endY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const lastDay = new Date(endY, endM, 0).getDate()
    const to = `${endY}-${String(endM).padStart(2, '0')}-${lastDay}`
    const startDate = new Date(endY, endM - 12, 1)
    const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`
    return { from, to }
  }

  // YTD: Jan 1 → last complete month (or Dec 31 for past years)
  const endMonth = year < now.getFullYear()
    ? 12
    : Math.max(now.getMonth(), 1)
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
  if (period.mode === 'half') return `H${period.half ?? 1} ${period.year}`
  if (period.mode === 'year') return `FY ${period.year}`
  if (period.mode === 'rolling12') return 'Rolling 12M'
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
  if (period.mode === 'half') {
    const h = period.half ?? 1
    return h === 1
      ? { mode: 'half', year: period.year - 1, half: 2 }
      : { mode: 'half', year: period.year, half: 1 }
  }
  if (period.mode === 'year') {
    return { mode: 'year', year: period.year - 1 }
  }
  if (period.mode === 'rolling12') {
    // Previous rolling12 = same window shifted back 12 months
    // We encode this as year-1 and handle in getPeriodDateRange for rolling12 by computing from "now - 12 months"
    // For comparison, we create a synthetic rolling12 for previous year
    return { mode: 'rolling12', year: period.year - 1, _rolling12Offset: 12 } as any
  }
  return { mode: 'ytd', year: period.year - 1 }
}

export function getYoYPeriod(period: PeriodDef): PeriodDef {
  return { ...period, year: period.year - 1 }
}

export function getComparisonPeriod(period: PeriodDef): PeriodDef | null {
  const compMode = period.comparison ?? 'previous'
  if (compMode === 'none') return null
  if (compMode === 'yoy') return getYoYPeriod(period)
  return getPreviousPeriod(period)
}

export function getDefaultPeriod(): PeriodDef {
  const now = new Date()
  const month = now.getMonth() + 1
  return { mode: 'month', year: now.getFullYear(), month, comparison: 'previous' }
}

function getLast12MonthsRange(period: PeriodDef): { from: string; to: string } {
  const { to } = getPeriodDateRange(period)
  const toDate = new Date(to)
  const fromDate = new Date(toDate.getFullYear(), toDate.getMonth() - 11, 1)
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-01`
  return { from, to }
}

// For rolling12 comparison (shifted back 12 months), compute an offset range
function getRolling12ComparisonRange(): { from: string; to: string } {
  const now = new Date()
  const endM = now.getMonth() === 0 ? 12 : now.getMonth()
  const endY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  // End = 12 months before the current rolling12 end
  const compEndDate = new Date(endY, endM - 12, 0) // last day of month 12 months prior
  const compEndYear = compEndDate.getFullYear()
  const compEndMonth = compEndDate.getMonth() + 1
  const lastDay = new Date(compEndYear, compEndMonth, 0).getDate()
  const to = `${compEndYear}-${String(compEndMonth).padStart(2, '0')}-${lastDay}`
  const startDate = new Date(compEndYear, compEndMonth - 12, 1)
  const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`
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
      // Server-side date filter — drastically reduces pages fetched
      date_start: from,
      date_end: to,
    })

    const invoices: ZohoInvoice[] = data.invoices || []
    allInvoices.push(...invoices)

    hasMore = data.page_context?.has_more_page ?? false
    page++
    if (page > 20) break // safety cap — with date filter this should never be hit
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
  return { count: invoices.length, total, collected, outstanding, totalMyr: total * fxToMyr, statusBreakdown }
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

function buildSegmentSummary(invoices: ZohoInvoice[], fxToMyr: number): SegmentSummary {
  const totalLocal = invoices.reduce((s, inv) => s + inv.total, 0)
  const outstandingLocal = invoices.reduce((s, inv) => s + inv.balance, 0)
  const map: Record<string, TopCustomer> = {}
  invoices.forEach((inv) => {
    if (!map[inv.customer_name])
      map[inv.customer_name] = { name: inv.customer_name, total: 0, outstanding: 0, invoiceCount: 0 }
    map[inv.customer_name].total += inv.total
    map[inv.customer_name].outstanding += inv.balance
    map[inv.customer_name].invoiceCount++
  })
  return {
    totalMyr:       totalLocal * fxToMyr,
    outstandingMyr: outstandingLocal * fxToMyr,
    collectedMyr:   (totalLocal - outstandingLocal) * fxToMyr,
    invoiceCount:   invoices.length,
    topCustomers:   Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10),
  }
}

function buildTopCustomers(invoices: ZohoInvoice[]): TopCustomer[] {
  const map: Record<string, TopCustomer> = {}
  invoices.forEach((inv) => {
    if (!map[inv.customer_name]) {
      map[inv.customer_name] = { name: inv.customer_name, total: 0, outstanding: 0, invoiceCount: 0 }
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyInvoices(invs: ZohoInvoice[]) {
  return {
    thirdParty: invs.filter((inv) => getCustomerType(inv.customer_name) === 'third-party'),
    interco:    invs.filter((inv) => getCustomerType(inv.customer_name) === 'interco'),
    rpt:        invs.filter((inv) => getCustomerType(inv.customer_name) === 'rpt'),
  }
}

// Main per-entity fetch — period + comparison only (NO trend).
// Trend is fetched separately via fetchDashboardTrend to keep this fast.
async function fetchEntityData(
  org: OrgConfig,
  periodRange: { from: string; to: string },
  comparisonRange: { from: string; to: string } | null,
  daysInPeriod: number
): Promise<EntitySummary> {
  const wideFrom = [
    periodRange.from,
    comparisonRange?.from ?? periodRange.from,
  ].sort()[0]
  const wideTo = [
    periodRange.to,
    comparisonRange?.to ?? periodRange.to,
  ].sort().reverse()[0]

  let allInvoices: ZohoInvoice[] = []
  try {
    allInvoices = await fetchOrgInvoices(org.id, wideFrom, wideTo)
  } catch (err) {
    console.error(`Failed to fetch ${org.name}:`, err)
  }

  const period3P = classifyInvoices(
    allInvoices.filter((inv) => inv.date >= periodRange.from && inv.date <= periodRange.to)
  )
  const comp3P = comparisonRange
    ? classifyInvoices(
        allInvoices.filter((inv) => inv.date >= comparisonRange.from && inv.date <= comparisonRange.to)
      )
    : null

  const period       = buildPeriodSummary(period3P.thirdParty, org.fxToMyr)
  const comparison   = comp3P ? buildPeriodSummary(comp3P.thirdParty, org.fxToMyr) : undefined
  const arAging      = buildArAging(period3P.thirdParty)
  const topCustomers = buildTopCustomers(period3P.thirdParty)
  const ratios       = buildRatios(period, arAging, topCustomers, daysInPeriod)
  const interco      = period3P.interco.length > 0 ? buildSegmentSummary(period3P.interco, org.fxToMyr) : undefined
  const rpt          = period3P.rpt.length > 0     ? buildSegmentSummary(period3P.rpt,     org.fxToMyr) : undefined

  return { org, period, comparison, arAging, topCustomers, ratios, monthlyTrend: [], interco, rpt }
}

// Separate trend fetch per entity — called after main dashboard renders.
async function fetchEntityTrend(
  org: OrgConfig,
  trendRange: { from: string; to: string }
): Promise<MonthDataPoint[]> {
  try {
    const invoices = await fetchOrgInvoices(org.id, trendRange.from, trendRange.to)
    const thirdParty = invoices.filter((inv) => getCustomerType(inv.customer_name) === 'third-party')
    return buildMonthlyTrend(thirdParty, org.fxToMyr)
  } catch {
    return []
  }
}

// ─── Main dashboard fetch ─────────────────────────────────────────────────────

export async function fetchDashboard(
  period: PeriodDef,
  includeComparison = true
): Promise<DashboardData> {
  const periodRange = getPeriodDateRange(period)
  const compPeriod = includeComparison ? getComparisonPeriod(period) : null

  let comparisonRange: { from: string; to: string } | null = null
  if (compPeriod) {
    if (period.mode === 'rolling12' && (period as any)._rolling12Offset) {
      comparisonRange = getRolling12ComparisonRange()
    } else {
      comparisonRange = getPeriodDateRange(compPeriod)
    }
  }

  const fromDate = new Date(periodRange.from)
  const toDate = new Date(periodRange.to)
  const daysInPeriod = differenceInDays(toDate, fromDate) + 1

  // Main fetch: period + comparison only. Trend is loaded separately (lazy).
  const entities = await Promise.all(
    ORGS.map((org) => fetchEntityData(org, periodRange, comparisonRange, daysInPeriod))
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

  const compLabel = compPeriod ? getPeriodLabel(compPeriod) : ''

  // Roll up interco and RPT across all entities
  const sumSegment = (key: 'interco' | 'rpt'): SegmentSummary | undefined => {
    const segs = entities.map((e) => e[key]).filter(Boolean) as import('@/types').SegmentSummary[]
    if (!segs.length) return undefined
    const topMap: Record<string, import('@/types').TopCustomer> = {}
    segs.forEach((s) => s.topCustomers.forEach((c) => {
      if (!topMap[c.name]) topMap[c.name] = { ...c }
      else {
        topMap[c.name].total += c.total
        topMap[c.name].outstanding += c.outstanding
        topMap[c.name].invoiceCount += c.invoiceCount
      }
    }))
    return {
      totalMyr:       segs.reduce((s, e) => s + e.totalMyr, 0),
      outstandingMyr: segs.reduce((s, e) => s + e.outstandingMyr, 0),
      collectedMyr:   segs.reduce((s, e) => s + e.collectedMyr, 0),
      invoiceCount:   segs.reduce((s, e) => s + e.invoiceCount, 0),
      topCustomers:   Object.values(topMap).sort((a, b) => b.total - a.total).slice(0, 10),
    }
  }

  return {
    entities,
    group,
    intercoGroup: sumSegment('interco'),
    rptGroup:     sumSegment('rpt'),
    periodLabel:  getPeriodLabel(period),
    comparisonLabel: compLabel,
    lastRefreshed: new Date().toISOString(),
    dateRange: periodRange,
  }
}

// ─── Trend-only fetch (called lazily after main dashboard) ───────────────────

export async function fetchDashboardTrend(
  period: PeriodDef
): Promise<MonthDataPoint[][]> {
  const trendRange = getLast12MonthsRange(period)
  const results = await Promise.all(
    ORGS.map((org) => fetchEntityTrend(org, trendRange))
  )
  return results
}

// ─── Annual multi-year fetch ──────────────────────────────────────────────────

export async function fetchAnnualData(fromYear = 2023): Promise<AnnualYearData[]> {
  const now = new Date()
  const currentYear = now.getFullYear()
  const wideFrom = `${fromYear}-01-01`
  const currentMonth = now.getMonth() + 1
  const lastDay = new Date(currentYear, currentMonth, 0).getDate()
  const wideTo = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`

  const years: number[] = []
  for (let y = fromYear; y <= currentYear; y++) years.push(y)

  // Fetch all invoices for each org in one wide call
  const entityResults = await Promise.all(
    ORGS.map(async (org) => {
      let invoices: ZohoInvoice[] = []
      try {
        invoices = await fetchOrgInvoices(org.id, wideFrom, wideTo)
      } catch (err) {
        console.error(`Annual fetch failed for ${org.name}:`, err)
      }
      return { org, invoices }
    })
  )

  return years.map((year) => {
    const yearFrom = `${year}-01-01`
    const yearTo = year < currentYear
      ? `${year}-12-31`
      : wideTo
    const daysInYear = year < currentYear
      ? 365
      : differenceInDays(new Date(yearTo), new Date(yearFrom)) + 1

    const entities: AnnualEntityRow[] = entityResults.map(({ org, invoices }) => {
      const yearInvoices = invoices.filter(
        (inv) => inv.date >= yearFrom && inv.date <= yearTo
      )
      const total = yearInvoices.reduce((s, inv) => s + inv.total, 0)
      const outstanding = yearInvoices.reduce((s, inv) => s + inv.balance, 0)
      const collected = total - outstanding
      const dso = total > 0 ? (outstanding / total) * daysInYear : 0

      return {
        orgId: org.id,
        orgShort: org.short,
        currency: org.currency,
        fxToMyr: org.fxToMyr,
        totalLocal: total,
        totalMyr: total * org.fxToMyr,
        collectedMyr: collected * org.fxToMyr,
        outstandingMyr: outstanding * org.fxToMyr,
        count: yearInvoices.length,
        collectionRate: total > 0 ? (collected / total) * 100 : 0,
        dso,
      }
    })

    const groupTotalMyr = entities.reduce((s, e) => s + e.totalMyr, 0)
    const groupCollectedMyr = entities.reduce((s, e) => s + e.collectedMyr, 0)
    const groupOutstandingMyr = entities.reduce((s, e) => s + e.outstandingMyr, 0)
    const groupCount = entities.reduce((s, e) => s + e.count, 0)

    return {
      year,
      entities,
      group: {
        totalMyr: groupTotalMyr,
        collectedMyr: groupCollectedMyr,
        outstandingMyr: groupOutstandingMyr,
        collectionRate: groupTotalMyr > 0 ? (groupCollectedMyr / groupTotalMyr) * 100 : 0,
        count: groupCount,
      },
    }
  })
}

// Legacy compat
export { getPeriodDateRange as getDateRange }
