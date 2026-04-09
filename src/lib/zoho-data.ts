import { zohoFetch } from './zoho-auth'
import { ORGS } from './orgs'
import type {
  ZohoInvoice,
  EntitySummary,
  GroupSummary,
  PeriodSummary,
  ArAging,
  TopCustomer,
  OrgConfig,
} from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

// ─── Date range helpers ───────────────────────────────────────────────────────

export function getDateRange(year: number, months: number[]) {
  const from = `${year}-${String(Math.min(...months)).padStart(2, '0')}-01`
  const lastMonth = Math.max(...months)
  const lastDay = new Date(year, lastMonth, 0).getDate()
  const to = `${year}-${String(lastMonth).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

// ─── Fetch all invoices for one org within a date range ───────────────────────

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

    const invoices: ZohoInvoice[] = (data.invoices || [])

    // Filter to our date range
    const inRange = invoices.filter(
      (inv) => inv.date >= from && inv.date <= to
    )
    allInvoices.push(...inRange)

    // Stop if we've gone past the from date (sorted descending)
    const hasOlder = invoices.some((inv) => inv.date < from)
    hasMore = !hasOlder && (data.page_context?.has_more_page ?? false)
    page++

    // Safety limit
    if (page > 20) break
  }

  return allInvoices
}

// ─── Build period summary from a list of invoices ────────────────────────────

function buildPeriodSummary(
  invoices: ZohoInvoice[],
  fxToMyr: number
): PeriodSummary {
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

// ─── AR aging ─────────────────────────────────────────────────────────────────

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

// ─── Top customers ────────────────────────────────────────────────────────────

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

  return Object.values(map)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
}

// ─── Fetch and aggregate one entity ──────────────────────────────────────────

async function fetchEntity(
  org: OrgConfig,
  from: string,
  to: string,
  janEnd: string,
  febStart: string
): Promise<EntitySummary> {
  let allInvoices: ZohoInvoice[] = []

  try {
    allInvoices = await fetchOrgInvoices(org.id, from, to)
  } catch (err) {
    console.error(`Failed to fetch ${org.name}:`, err)
    // Return empty summary on error rather than crashing
  }

  const janInvoices = allInvoices.filter((inv) => inv.date <= janEnd)
  const febInvoices = allInvoices.filter((inv) => inv.date >= febStart)

  return {
    org,
    jan: buildPeriodSummary(janInvoices, org.fxToMyr),
    feb: buildPeriodSummary(febInvoices, org.fxToMyr),
    ytd: buildPeriodSummary(allInvoices, org.fxToMyr),
    arAging: buildArAging(allInvoices),
    topCustomers: buildTopCustomers(allInvoices),
  }
}

// ─── Main export: fetch all entities ─────────────────────────────────────────

export async function fetchGroupSummary(
  year = 2026,
  months = [1, 2]
): Promise<GroupSummary> {
  const { from, to } = getDateRange(year, months)
  const janEnd = `${year}-01-31`
  const febStart = `${year}-02-01`

  // Fetch all orgs in parallel
  const entities = await Promise.all(
    ORGS.map((org) => fetchEntity(org, from, to, janEnd, febStart))
  )

  const sumMyr = (fn: (e: EntitySummary) => number) =>
    entities.reduce((s, e) => s + fn(e), 0)

  const groupYtd = sumMyr((e) => e.ytd.totalMyr)
  const groupOutstanding = sumMyr((e) => e.ytd.outstanding * e.org.fxToMyr)

  return {
    entities,
    group: {
      jan: sumMyr((e) => e.jan.totalMyr),
      feb: sumMyr((e) => e.feb.totalMyr),
      ytd: groupYtd,
      outstanding: groupOutstanding,
      collectionRate:
        groupYtd > 0
          ? ((groupYtd - groupOutstanding) / groupYtd) * 100
          : 0,
    },
    lastRefreshed: new Date().toISOString(),
    dateRange: { from, to },
  }
}
