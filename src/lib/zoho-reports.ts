/**
 * Zoho Books Reports API
 *
 * Fetches P&L, Balance Sheet, and Cash Flow Statement for a given org + period.
 * Parses Zoho's hierarchical row structure into clean FSLineItem trees.
 *
 * Zoho API endpoints:
 *   GET /books/v3/reports/profitandloss
 *   GET /books/v3/reports/balancesheet
 *   GET /books/v3/reports/cashflow
 */

import { zohoFetch } from './zoho-auth'
import { getAverageRate, getClosingRate } from './bnm-rates'
import { ORGS, ORG_MAP } from './orgs'
import type {
  FSLineItem,
  PLData,
  PLStatement,
  BSData,
  BalanceSheetStatement,
  CFData,
  CashFlowStatement,
  FinancialPeriod,
} from '@/types/financials'

// ─── Period date helpers ──────────────────────────────────────────────────────

export function getFinancialDateRange(period: FinancialPeriod): { from: string; to: string } {
  const { mode, year, month, quarter, half } = period
  const now = new Date()

  if (mode === 'month' && month) {
    const from = `${year}-${pad(month)}-01`
    const to = `${year}-${pad(month)}-${lastDay(year, month)}`
    return { from, to }
  }
  if (mode === 'quarter' && quarter) {
    const sm = (quarter - 1) * 3 + 1
    const em = quarter * 3
    return { from: `${year}-${pad(sm)}-01`, to: `${year}-${pad(em)}-${lastDay(year, em)}` }
  }
  if (mode === 'half') {
    const h = half ?? 1
    const sm = h === 1 ? 1 : 7
    const em = h === 1 ? 6 : 12
    return { from: `${year}-${pad(sm)}-01`, to: `${year}-${pad(em)}-${lastDay(year, em)}` }
  }
  // year
  const endM = year < now.getFullYear() ? 12 : now.getMonth() + 1
  return { from: `${year}-01-01`, to: `${year}-${pad(endM)}-${lastDay(year, endM)}` }
}

export function getComparisonPeriod(period: FinancialPeriod): FinancialPeriod | null {
  if (period.comparison === 'none') return null
  if (period.comparison === 'yoy') return { ...period, year: period.year - 1, comparison: 'none' }
  // previous
  if (period.mode === 'month') {
    const m = period.month!
    return m === 1
      ? { ...period, year: period.year - 1, month: 12, comparison: 'none' }
      : { ...period, month: m - 1, comparison: 'none' }
  }
  if (period.mode === 'quarter') {
    const q = period.quarter!
    return q === 1
      ? { ...period, year: period.year - 1, quarter: 4, comparison: 'none' }
      : { ...period, quarter: (q - 1) as 1|2|3|4, comparison: 'none' }
  }
  if (period.mode === 'half') {
    const h = period.half ?? 1
    return h === 1
      ? { ...period, year: period.year - 1, half: 2, comparison: 'none' }
      : { ...period, half: 1, comparison: 'none' }
  }
  return { ...period, year: period.year - 1, comparison: 'none' }
}

export function getFinancialPeriodLabel(period: FinancialPeriod): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  if (period.mode === 'month' && period.month) return `${MONTHS[period.month - 1]} ${period.year}`
  if (period.mode === 'quarter' && period.quarter) return `Q${period.quarter} ${period.year}`
  if (period.mode === 'half') return `H${period.half ?? 1} ${period.year}`
  return `FY ${period.year}`
}

// ─── Number parsing ───────────────────────────────────────────────────────────

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    // Remove commas, parens (negatives), currency symbols
    const clean = v.replace(/[,$%]/g, '').replace(/\(([^)]+)\)/, '-$1').trim()
    const n = parseFloat(clean)
    return isNaN(n) ? 0 : n
  }
  return 0
}

// ─── Line item tree builder ───────────────────────────────────────────────────

function buildItems(accounts: any[]): FSLineItem[] {
  if (!Array.isArray(accounts)) return []
  return accounts.map((a: any) => ({
    account: a.account_name ?? a.name ?? '',
    accountId: a.account_id ?? '',
    amount: parseNum(a.total ?? a.amount ?? 0),
    subItems: a.sub_accounts?.length
      ? buildItems(a.sub_accounts)
      : a.sub_rows?.length
      ? buildItems(a.sub_rows)
      : undefined,
  }))
}

// ─── P&L fetch & parse ────────────────────────────────────────────────────────

async function fetchRawPL(orgId: string, from: string, to: string): Promise<any> {
  return zohoFetch('/reports/profitandloss', {
    organization_id: orgId,
    from_date: from,
    to_date: to,
    basis: 'Accrual',
  })
}

function parsePLData(raw: any): PLData {
  // Zoho may wrap in different top-level keys
  const pl = raw?.profit_and_loss ?? raw?.report ?? raw ?? {}

  const revenue = buildItems(pl.total_income?.accounts ?? pl.income?.accounts ?? [])
  const totalRevenue = parseNum(pl.total_income?.total ?? pl.income?.total ?? pl.total_revenue ?? 0)

  const cogs = buildItems(pl.total_cogs?.accounts ?? pl.cost_of_goods_sold?.accounts ?? [])
  const totalCogs = parseNum(pl.total_cogs?.total ?? pl.cost_of_goods_sold?.total ?? 0)

  const grossProfit = parseNum(pl.gross_profit ?? totalRevenue - totalCogs)
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  const opexAccounts =
    pl.total_expense?.accounts ??
    pl.operating_expense?.accounts ??
    pl.total_operating_expense?.accounts ?? []
  const operatingExpenses = buildItems(opexAccounts)
  const totalOpex = parseNum(
    pl.total_expense?.total ?? pl.operating_expense?.total ?? pl.total_operating_expense?.total ?? 0
  )

  const ebit = parseNum(pl.net_operating_income ?? pl.operating_profit ?? grossProfit - totalOpex)
  const ebitMargin = totalRevenue > 0 ? (ebit / totalRevenue) * 100 : 0
  const ebitda = ebit // We'll separate D&A below if available
  const ebitdaMargin = ebitMargin
  const depreciation = parseNum(pl.depreciation ?? 0)
  const amortization = parseNum(pl.amortization ?? 0)

  const otherIncome = buildItems(pl.total_other_income?.accounts ?? pl.other_income?.accounts ?? [])
  const totalOtherIncome = parseNum(pl.total_other_income?.total ?? pl.other_income?.total ?? 0)

  const otherExpenses = buildItems(pl.total_other_expense?.accounts ?? pl.other_expense?.accounts ?? [])
  const totalOtherExpenses = parseNum(pl.total_other_expense?.total ?? pl.other_expense?.total ?? 0)

  const ebt = parseNum(pl.net_profit_before_tax ?? ebit + totalOtherIncome - totalOtherExpenses)
  const ebtMargin = totalRevenue > 0 ? (ebt / totalRevenue) * 100 : 0

  const tax = buildItems(pl.total_tax?.accounts ?? pl.tax?.accounts ?? [])
  const totalTax = parseNum(pl.total_tax?.total ?? pl.tax?.total ?? 0)

  const netProfit = parseNum(pl.net_profit ?? ebt - totalTax)
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  return {
    revenue, totalRevenue,
    cogs, totalCogs,
    grossProfit, grossMargin,
    operatingExpenses, totalOpex,
    ebitda, ebitdaMargin,
    depreciation, amortization,
    ebit, ebitMargin,
    otherIncome, totalOtherIncome,
    otherExpenses, totalOtherExpenses,
    ebt, ebtMargin,
    tax, totalTax,
    netProfit, netMargin,
  }
}

export async function fetchPLStatement(
  orgId: string,
  period: FinancialPeriod
): Promise<PLStatement> {
  const org = ORG_MAP[orgId]
  const range = getFinancialDateRange(period)
  const compPeriod = getComparisonPeriod(period)
  const compRange = compPeriod ? getFinancialDateRange(compPeriod) : null

  // Fetch avg FX rate for P&L (IAS 21)
  const [fxRateData, compFxData] = await Promise.all([
    getAverageRate(org.currency, range.from, range.to),
    compRange ? getAverageRate(org.currency, compRange.from, compRange.to) : Promise.resolve(null),
  ])
  const fxRate = fxRateData.rate

  try {
    const [raw, compRaw] = await Promise.all([
      fetchRawPL(orgId, range.from, range.to),
      compRange ? fetchRawPL(orgId, compRange.from, compRange.to) : Promise.resolve(null),
    ])

    const data = parsePLData(raw)
    const comparison = compRaw ? parsePLData(compRaw) : undefined

    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate, dateRange: range, data, comparison,
      comparisonFxRate: compFxData?.rate,
      comparisonDateRange: compRange ?? undefined,
    }
  } catch (err: any) {
    console.error(`P&L fetch failed for ${org.name}:`, err)
    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate, dateRange: range, data: emptyPL(), error: err.message,
    }
  }
}

function emptyPL(): PLData {
  return {
    revenue: [], totalRevenue: 0, cogs: [], totalCogs: 0,
    grossProfit: 0, grossMargin: 0, operatingExpenses: [], totalOpex: 0,
    ebitda: 0, ebitdaMargin: 0, depreciation: 0, amortization: 0,
    ebit: 0, ebitMargin: 0, otherIncome: [], totalOtherIncome: 0,
    otherExpenses: [], totalOtherExpenses: 0, ebt: 0, ebtMargin: 0,
    tax: [], totalTax: 0, netProfit: 0, netMargin: 0,
  }
}

// ─── Balance Sheet fetch & parse ──────────────────────────────────────────────

async function fetchRawBS(orgId: string, asOfDate: string): Promise<any> {
  return zohoFetch('/reports/balancesheet', {
    organization_id: orgId,
    as_of_date: asOfDate,
    basis: 'Accrual',
  })
}

function parseBSData(raw: any): BSData {
  const bs = raw?.balance_sheet ?? raw?.report ?? raw ?? {}

  const assets = bs.assets ?? bs.asset ?? {}
  const liab = bs.liabilities ?? bs.liability ?? {}
  const eq = bs.equity ?? {}

  const currentAssets = buildItems(
    assets.current_assets?.accounts ?? assets.current_assets?.sub_accounts ?? []
  )
  const totalCurrentAssets = parseNum(assets.current_assets?.total ?? assets.total_current_assets ?? 0)

  const nonCurrentAssets = buildItems(
    assets.fixed_assets?.accounts ?? assets.non_current_assets?.accounts ?? []
  )
  const totalNonCurrentAssets = parseNum(
    assets.fixed_assets?.total ?? assets.non_current_assets?.total ?? assets.total_fixed_assets ?? 0
  )

  const totalAssets = parseNum(assets.total ?? bs.total_assets ?? totalCurrentAssets + totalNonCurrentAssets)

  const currentLiabilities = buildItems(
    liab.current_liabilities?.accounts ?? liab.current_liabilities?.sub_accounts ?? []
  )
  const totalCurrentLiabilities = parseNum(
    liab.current_liabilities?.total ?? liab.total_current_liabilities ?? 0
  )

  const nonCurrentLiabilities = buildItems(
    liab.long_term_liabilities?.accounts ?? liab.non_current_liabilities?.accounts ?? []
  )
  const totalNonCurrentLiabilities = parseNum(
    liab.long_term_liabilities?.total ?? liab.non_current_liabilities?.total ?? 0
  )

  const totalLiabilities = parseNum(
    liab.total ?? bs.total_liabilities ?? totalCurrentLiabilities + totalNonCurrentLiabilities
  )

  const equity = buildItems(eq.accounts ?? eq.capital?.accounts ?? [])
  const totalEquity = parseNum(eq.total ?? bs.total_equity ?? 0)

  const totalLiabilitiesAndEquity = parseNum(
    bs.total_liabilities_and_equity ?? totalLiabilities + totalEquity
  )

  // Derived ratios
  const cashItem = currentAssets.find((a) =>
    /cash|bank/i.test(a.account)
  )
  const cash = cashItem?.amount ?? 0
  const currentRatio = totalCurrentLiabilities > 0
    ? totalCurrentAssets / totalCurrentLiabilities : 0
  const quickRatio = totalCurrentLiabilities > 0
    ? (totalCurrentAssets - cash * 0.5) / totalCurrentLiabilities : 0
  const debtToEquity = totalEquity !== 0
    ? totalLiabilities / Math.abs(totalEquity) : 0
  const workingCapital = totalCurrentAssets - totalCurrentLiabilities

  // Short-term debt for net debt
  const debtItem = currentLiabilities.find((a) => /loan|borrow|debt|bank/i.test(a.account))
  const shortTermDebt = debtItem?.amount ?? 0
  const netDebt = shortTermDebt - cash

  return {
    currentAssets, totalCurrentAssets,
    nonCurrentAssets, totalNonCurrentAssets,
    totalAssets, currentLiabilities, totalCurrentLiabilities,
    nonCurrentLiabilities, totalNonCurrentLiabilities,
    totalLiabilities, equity, totalEquity, totalLiabilitiesAndEquity,
    currentRatio, quickRatio, debtToEquity, workingCapital, netDebt,
  }
}

export async function fetchBSStatement(
  orgId: string,
  period: FinancialPeriod
): Promise<BalanceSheetStatement> {
  const org = ORG_MAP[orgId]
  const range = getFinancialDateRange(period)
  const asOfDate = range.to // closing date for BS
  const compPeriod = getComparisonPeriod(period)
  const compDate = compPeriod ? getFinancialDateRange(compPeriod).to : null

  const [fxRateData, compFxData] = await Promise.all([
    getClosingRate(org.currency, asOfDate),
    compDate ? getClosingRate(org.currency, compDate) : Promise.resolve(null),
  ])

  try {
    const [raw, compRaw] = await Promise.all([
      fetchRawBS(orgId, asOfDate),
      compDate ? fetchRawBS(orgId, compDate) : Promise.resolve(null),
    ])

    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate: fxRateData.rate, asOfDate, data: parseBSData(raw),
      comparison: compRaw ? parseBSData(compRaw) : undefined,
      comparisonFxRate: compFxData?.rate,
      comparisonDate: compDate ?? undefined,
    }
  } catch (err: any) {
    console.error(`BS fetch failed for ${org.name}:`, err)
    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate: fxRateData.rate, asOfDate, data: emptyBS(), error: err.message,
    }
  }
}

function emptyBS(): BSData {
  return {
    currentAssets: [], totalCurrentAssets: 0, nonCurrentAssets: [], totalNonCurrentAssets: 0,
    totalAssets: 0, currentLiabilities: [], totalCurrentLiabilities: 0,
    nonCurrentLiabilities: [], totalNonCurrentLiabilities: 0, totalLiabilities: 0,
    equity: [], totalEquity: 0, totalLiabilitiesAndEquity: 0,
    currentRatio: 0, quickRatio: 0, debtToEquity: 0, workingCapital: 0, netDebt: 0,
  }
}

// ─── Cash Flow fetch & parse ──────────────────────────────────────────────────

async function fetchRawCF(orgId: string, from: string, to: string): Promise<any> {
  return zohoFetch('/reports/cashflow', {
    organization_id: orgId,
    from_date: from,
    to_date: to,
  })
}

function parseCFData(raw: any, netProfit = 0): CFData {
  const cf = raw?.cash_flow_statement ?? raw?.cashflow ?? raw?.report ?? raw ?? {}

  const operatingActivities = buildItems(
    cf.operating_activities?.accounts ?? cf.operating_activities?.sub_accounts ?? []
  )
  const totalOperating = parseNum(
    cf.operating_activities?.total ?? cf.total_operating_activities ?? cf.net_operating_activities ?? 0
  )

  const investingActivities = buildItems(
    cf.investing_activities?.accounts ?? cf.investing_activities?.sub_accounts ?? []
  )
  const totalInvesting = parseNum(
    cf.investing_activities?.total ?? cf.total_investing_activities ?? 0
  )

  const financingActivities = buildItems(
    cf.financing_activities?.accounts ?? cf.financing_activities?.sub_accounts ?? []
  )
  const totalFinancing = parseNum(
    cf.financing_activities?.total ?? cf.total_financing_activities ?? 0
  )

  const netCashChange = parseNum(
    cf.net_cash ?? cf.net_change_in_cash ?? totalOperating + totalInvesting + totalFinancing
  )
  const openingBalance = parseNum(cf.opening_cash_balance ?? cf.opening_balance ?? 0)
  const closingBalance = parseNum(cf.closing_cash_balance ?? cf.closing_balance ?? openingBalance + netCashChange)

  // Capex = negative investing items (property, equipment purchases)
  const capex = Math.abs(
    investingActivities
      .filter((i) => i.amount < 0 && /asset|equip|property|capex|purchase/i.test(i.account))
      .reduce((s, i) => s + i.amount, 0)
  )
  const freeCashFlow = totalOperating - capex
  const cashConversionRate = netProfit !== 0 ? (freeCashFlow / netProfit) * 100 : 0

  return {
    operatingActivities, totalOperating,
    investingActivities, totalInvesting,
    financingActivities, totalFinancing,
    netCashChange, openingBalance, closingBalance,
    freeCashFlow, cashConversionRate,
  }
}

export async function fetchCFStatement(
  orgId: string,
  period: FinancialPeriod
): Promise<CashFlowStatement> {
  const org = ORG_MAP[orgId]
  const range = getFinancialDateRange(period)
  const compPeriod = getComparisonPeriod(period)
  const compRange = compPeriod ? getFinancialDateRange(compPeriod) : null

  const [fxRateData, compFxData] = await Promise.all([
    getAverageRate(org.currency, range.from, range.to),
    compRange ? getAverageRate(org.currency, compRange.from, compRange.to) : Promise.resolve(null),
  ])

  try {
    const [raw, compRaw] = await Promise.all([
      fetchRawCF(orgId, range.from, range.to),
      compRange ? fetchRawCF(orgId, compRange.from, compRange.to) : Promise.resolve(null),
    ])

    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate: fxRateData.rate, dateRange: range,
      data: parseCFData(raw), comparison: compRaw ? parseCFData(compRaw) : undefined,
      comparisonFxRate: compFxData?.rate, comparisonDateRange: compRange ?? undefined,
    }
  } catch (err: any) {
    console.error(`CF fetch failed for ${org.name}:`, err)
    return {
      orgId, orgShort: org.short, orgName: org.name, currency: org.currency,
      fxRate: fxRateData.rate, dateRange: range, data: emptyCF(), error: err.message,
    }
  }
}

function emptyCF(): CFData {
  return {
    operatingActivities: [], totalOperating: 0,
    investingActivities: [], totalInvesting: 0,
    financingActivities: [], totalFinancing: 0,
    netCashChange: 0, openingBalance: 0, closingBalance: 0,
    freeCashFlow: 0, cashConversionRate: 0,
  }
}

// ─── All entities batch ───────────────────────────────────────────────────────

export async function fetchAllPL(period: FinancialPeriod): Promise<PLStatement[]> {
  return Promise.all(ORGS.map((org) => fetchPLStatement(org.id, period)))
}

export async function fetchAllBS(period: FinancialPeriod): Promise<BalanceSheetStatement[]> {
  return Promise.all(ORGS.map((org) => fetchBSStatement(org.id, period)))
}

export async function fetchAllCF(period: FinancialPeriod): Promise<CashFlowStatement[]> {
  return Promise.all(ORGS.map((org) => fetchCFStatement(org.id, period)))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDay(year: number, month: number): string {
  return String(new Date(year, month, 0).getDate())
}
