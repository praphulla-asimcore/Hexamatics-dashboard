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
// Handles actual Zoho response: items use `name` and `account_transactions`

function buildItems(items: any[]): FSLineItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((a: any) => a.name || a.account_name) // skip empty
    .map((a: any) => {
      const subTxns: any[] = a.account_transactions ?? a.sub_accounts ?? a.sub_rows ?? []
      return {
        account: a.name ?? a.account_name ?? '',
        accountId: a.account_id ?? '',
        amount: parseNum(a.total ?? a.amount ?? 0),
        subItems: subTxns.length ? buildItems(subTxns) : undefined,
      }
    })
}

// ─── P&L fetch & parse ────────────────────────────────────────────────────────
// Actual Zoho P&L response structure:
//
//   profit_and_loss = [
//     { name: "Gross Profit",    total: X, account_transactions: [
//         { name: "Operating Income",     total: X, account_transactions: [revenue items] },
//         { name: "Cost of Goods Sold",   total: X, account_transactions: [cogs items]   },
//     ]},
//     { name: "Operating Profit", total: X, account_transactions: [
//         { name: "Operating Expense",    total: X, account_transactions: [opex items]   },
//     ]},
//     { name: "Net Profit/Loss",  total: X, account_transactions: [
//         { name: "Non Operating Income", total: X, account_transactions: [other income] },
//         { name: "Non Operating Expense",total: X, account_transactions: [tax+FX+other] },
//     ]},
//   ]

async function fetchRawPL(orgId: string, from: string, to: string): Promise<any> {
  return zohoFetch('/reports/profitandloss', {
    organization_id: orgId,
    from_date: from,
    to_date: to,
    basis: 'Accrual',
  })
}

function parsePLData(raw: any): PLData {
  const sections: any[] = raw?.profit_and_loss ?? []

  // Find a top-level section by keyword
  function findSection(kw: string): any {
    return sections.find((s) => s.name?.toLowerCase().includes(kw))
  }

  // Find a sub-category within a section's account_transactions
  function findCat(section: any, kw: string): any {
    return (section?.account_transactions ?? []).find(
      (c: any) => c.name?.toLowerCase().includes(kw)
    )
  }

  const grossProfitSection   = findSection('gross profit')
  const operatingProfitSection = findSection('operating profit')
  const netProfitSection     = findSection('net profit')

  // ── Revenue ──────────────────────────────────────────────────
  const revCat = findCat(grossProfitSection, 'operating income')
    ?? findCat(grossProfitSection, 'income')
    ?? findCat(grossProfitSection, 'revenue')
  const revenue = buildItems(revCat?.account_transactions ?? [])
  const totalRevenue = parseNum(revCat?.total ?? 0)

  // ── COGS ─────────────────────────────────────────────────────
  const cogsCat = findCat(grossProfitSection, 'cost of goods sold')
    ?? findCat(grossProfitSection, 'cogs')
    ?? findCat(grossProfitSection, 'cost of')
  const cogs = buildItems(cogsCat?.account_transactions ?? [])
  const totalCogs = parseNum(cogsCat?.total ?? 0)

  // ── Gross Profit ──────────────────────────────────────────────
  const grossProfit = parseNum(grossProfitSection?.total ?? totalRevenue - totalCogs)
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // ── Operating Expenses ────────────────────────────────────────
  const opexCat = findCat(operatingProfitSection, 'operating expense')
    ?? findCat(operatingProfitSection, 'expense')
  const allOpexItems: any[] = opexCat?.account_transactions ?? []
  const operatingExpenses = buildItems(allOpexItems)
  const totalOpex = parseNum(opexCat?.total ?? 0)

  // Extract D&A from opex for EBITDA calculation
  const daItem = allOpexItems.find((t) => /depreciation|amortization/i.test(t.name ?? ''))
  const depreciation = parseNum(daItem?.total ?? 0)

  // ── EBIT (Operating Profit) ───────────────────────────────────
  const ebit = parseNum(operatingProfitSection?.total ?? grossProfit - totalOpex)
  const ebitMargin = totalRevenue > 0 ? (ebit / totalRevenue) * 100 : 0

  // ── EBITDA = EBIT + D&A ───────────────────────────────────────
  const ebitda = ebit + depreciation
  const ebitdaMargin = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0

  // ── Non-Operating Income ──────────────────────────────────────
  const nonOpIncCat = findCat(netProfitSection, 'non operating income')
    ?? findCat(netProfitSection, 'other income')
  const otherIncome = buildItems(nonOpIncCat?.account_transactions ?? [])
  const totalOtherIncome = parseNum(nonOpIncCat?.total ?? 0)

  // ── Non-Operating Expense (tax is embedded here in Zoho) ─────
  const nonOpExpCat = findCat(netProfitSection, 'non operating expense')
    ?? findCat(netProfitSection, 'other expense')
  const allNonOpExpItems: any[] = nonOpExpCat?.account_transactions ?? []

  // Separate income tax from other non-operating expenses
  const taxItems    = allNonOpExpItems.filter((t) => /tax/i.test(t.name ?? ''))
  const nonTaxItems = allNonOpExpItems.filter((t) => !/tax/i.test(t.name ?? ''))

  const tax = buildItems(taxItems)
  const totalTax = taxItems.reduce((s, t) => s + parseNum(t.total), 0)
  const otherExpenses = buildItems(nonTaxItems)
  const totalOtherExpenses = nonTaxItems.reduce((s, t) => s + parseNum(t.total), 0)

  // ── Net Profit ────────────────────────────────────────────────
  const netProfit = parseNum(netProfitSection?.total ?? 0)
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // EBT = Net Profit + Tax (reverse-engineered since Zoho gives net directly)
  const ebt = netProfit + totalTax
  const ebtMargin = totalRevenue > 0 ? (ebt / totalRevenue) * 100 : 0

  return {
    revenue, totalRevenue,
    cogs, totalCogs,
    grossProfit, grossMargin,
    operatingExpenses, totalOpex,
    ebitda, ebitdaMargin,
    depreciation, amortization: 0,
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
  // Actual Zoho BS structure (confirmed via debug):
  //   balance_sheet = [
  //     { name: "Assets", total: X, account_transactions: [
  //         { name: "Current Assets",    total: X, account_transactions: [...] },
  //         { name: "Non Current Assets",total: 0 },
  //         { name: "Fixed Assets",      total: X, account_transactions: [...] },
  //         { name: "Other Assets",      total: X, account_transactions: [...] },
  //     ]},
  //     { name: "Liabilities & Equities", total: X, account_transactions: [
  //         { name: "Liabilities", total: X, account_transactions: [
  //             { name: "Current Liabilities",     total: X, account_transactions: [...] },
  //             { name: "Non Current Liabilities", total: X, account_transactions: [...] },
  //             { name: "Other Liabilities",       total: X, account_transactions: [...] },
  //         ]},
  //         { name: "Equities", total: X, account_transactions: [
  //             { name: "Current Year Earnings", total: X },
  //             { name: "Retained Earnings",     total: X },
  //             { name: "Share capital",          total: X },
  //         ]},
  //     ]},
  //   ]

  const sections: any[] = raw?.balance_sheet ?? []

  function findSection(kw: string): any {
    return sections.find((s) => s.name?.toLowerCase().includes(kw))
  }
  function findCat(section: any, kw: string): any {
    return (section?.account_transactions ?? []).find(
      (c: any) => c.name?.toLowerCase().includes(kw)
    )
  }

  if (Array.isArray(sections) && sections.length > 0) {
    // ── Assets ────────────────────────────────────────────────────
    const assetsSection   = findSection('asset')
    const curAssetsCat    = findCat(assetsSection, 'current asset')
    const fixedAssetsCat  = findCat(assetsSection, 'fixed asset')
    const nonCurAssetsCat = findCat(assetsSection, 'non current asset')
      ?? findCat(assetsSection, 'noncurrent asset')
    const otherAssetsCat  = findCat(assetsSection, 'other asset')

    const currentAssets      = buildItems(curAssetsCat?.account_transactions ?? [])
    const totalCurrentAssets = parseNum(curAssetsCat?.total ?? 0)

    // Combine Fixed + Non Current + Other Assets into non-current bucket
    const nonCurrentAssets = buildItems([
      ...(fixedAssetsCat?.account_transactions ?? (fixedAssetsCat ? [fixedAssetsCat] : [])),
      ...(nonCurAssetsCat?.account_transactions ?? (nonCurAssetsCat ? [nonCurAssetsCat] : [])),
      ...(otherAssetsCat?.account_transactions ?? (otherAssetsCat ? [otherAssetsCat] : [])),
    ])
    const totalNonCurrentAssets =
      parseNum(fixedAssetsCat?.total ?? 0) +
      parseNum(nonCurAssetsCat?.total ?? 0) +
      parseNum(otherAssetsCat?.total ?? 0)
    const totalAssets = parseNum(assetsSection?.total ?? totalCurrentAssets + totalNonCurrentAssets)

    // ── Liabilities & Equities ────────────────────────────────────
    // Top-level section is "Liabilities & Equities"; drill in to find sub-sections
    const liabEquitySection = findSection('liabilit') // matches "Liabilities & Equities"
    const liabSection       = findCat(liabEquitySection, 'liabilit') ?? liabEquitySection
    const equitySection     = findCat(liabEquitySection, 'equit') ?? findSection('equit')

    const curLiabCat    = findCat(liabSection, 'current liabilit')
    const nonCurLiabCat = findCat(liabSection, 'non current liabilit')
      ?? findCat(liabSection, 'long term')
    const otherLiabCat  = findCat(liabSection, 'other liabilit')

    const currentLiabilities      = buildItems(curLiabCat?.account_transactions ?? [])
    const totalCurrentLiabilities = parseNum(curLiabCat?.total ?? 0)

    const nonCurrentLiabilities = buildItems([
      ...(nonCurLiabCat?.account_transactions ?? (nonCurLiabCat ? [nonCurLiabCat] : [])),
      ...(otherLiabCat?.account_transactions ?? (otherLiabCat ? [otherLiabCat] : [])),
    ])
    const totalNonCurrentLiabilities =
      parseNum(nonCurLiabCat?.total ?? 0) + parseNum(otherLiabCat?.total ?? 0)
    const totalLiabilities = parseNum(
      liabSection?.total ?? totalCurrentLiabilities + totalNonCurrentLiabilities
    )

    const equity      = buildItems(equitySection?.account_transactions ?? [])
    const totalEquity = parseNum(equitySection?.total ?? 0)
    const totalLiabilitiesAndEquity = parseNum(
      liabEquitySection?.total ?? totalLiabilities + totalEquity
    )

    return deriveBSRatios({
      currentAssets, totalCurrentAssets, nonCurrentAssets, totalNonCurrentAssets, totalAssets,
      currentLiabilities, totalCurrentLiabilities, nonCurrentLiabilities, totalNonCurrentLiabilities,
      totalLiabilities, equity, totalEquity, totalLiabilitiesAndEquity,
    })
  }

  // ── Fallback: flat object format ──────────────────────────────
  const bs = raw?.balance_sheet ?? raw?.report ?? raw ?? {}
  const assets = bs.assets ?? bs.asset ?? {}
  const liab   = bs.liabilities ?? bs.liability ?? {}
  const eq     = bs.equity ?? {}

  const currentAssets      = buildItems(assets.current_assets?.accounts ?? assets.current_assets?.account_transactions ?? [])
  const totalCurrentAssets = parseNum(assets.current_assets?.total ?? 0)
  const nonCurrentAssets   = buildItems(assets.fixed_assets?.accounts ?? assets.fixed_assets?.account_transactions ?? [])
  const totalNonCurrentAssets = parseNum(assets.fixed_assets?.total ?? 0)
  const totalAssets        = parseNum(assets.total ?? bs.total_assets ?? totalCurrentAssets + totalNonCurrentAssets)
  const currentLiabilities = buildItems(liab.current_liabilities?.accounts ?? liab.current_liabilities?.account_transactions ?? [])
  const totalCurrentLiabilities = parseNum(liab.current_liabilities?.total ?? 0)
  const nonCurrentLiabilities   = buildItems(liab.long_term_liabilities?.accounts ?? liab.long_term_liabilities?.account_transactions ?? [])
  const totalNonCurrentLiabilities = parseNum(liab.long_term_liabilities?.total ?? 0)
  const totalLiabilities   = parseNum(liab.total ?? totalCurrentLiabilities + totalNonCurrentLiabilities)
  const equity             = buildItems(eq.accounts ?? eq.account_transactions ?? [])
  const totalEquity        = parseNum(eq.total ?? 0)
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  return deriveBSRatios({
    currentAssets, totalCurrentAssets, nonCurrentAssets, totalNonCurrentAssets, totalAssets,
    currentLiabilities, totalCurrentLiabilities, nonCurrentLiabilities, totalNonCurrentLiabilities,
    totalLiabilities, equity, totalEquity, totalLiabilitiesAndEquity,
  })
}

function deriveBSRatios(d: Omit<BSData, 'currentRatio'|'quickRatio'|'debtToEquity'|'workingCapital'|'netDebt'>): BSData {
  // Sum all cash & bank items (Zoho splits Cash and Bank as separate line items)
  const cash = d.currentAssets
    .filter((a) => /^cash$|^bank$/i.test(a.account.trim()))
    .reduce((s, a) => s + a.amount, 0)
  const currentRatio  = d.totalCurrentLiabilities > 0 ? d.totalCurrentAssets / d.totalCurrentLiabilities : 0
  const quickRatio    = d.totalCurrentLiabilities > 0 ? (d.totalCurrentAssets - cash) / d.totalCurrentLiabilities : 0
  const debtToEquity  = d.totalEquity !== 0 ? d.totalLiabilities / Math.abs(d.totalEquity) : 0
  const workingCapital = d.totalCurrentAssets - d.totalCurrentLiabilities
  const debtItem = d.currentLiabilities.find((a) => /loan|borrow|debt/i.test(a.account))
  const netDebt = (debtItem?.amount ?? 0) - cash
  return { ...d, currentRatio, quickRatio, debtToEquity, workingCapital, netDebt }
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
  // Actual Zoho CF structure (confirmed via debug):
  //   cash_flow = [                         ← top-level key is "cash_flow"
  //     { name: "Beginning Cash Balance", total: X },
  //     { name: "Net Change in cash", total: X, account_transactions: [
  //         { name: "Cash Flow from Operating Activities", total: X, account_transactions: [...] },
  //         { name: "Cash Flow from Investing Activities", total: X },
  //         { name: "Cash Flow from Financing Activities", total: X },
  //     ]},
  //     { name: "Ending Cash Balance", total: X },
  //   ]

  const sections: any[] = raw?.cash_flow ?? raw?.cashflow ?? raw?.cash_flow_statement ?? []

  function findSection(kw: string): any {
    return sections.find((s) => s.name?.toLowerCase().includes(kw))
  }

  if (Array.isArray(sections) && sections.length > 0) {
    const openSection      = findSection('beginning')   // "Beginning Cash Balance"
    const netChangeSection = findSection('net change')  // "Net Change in cash"
    const closeSection     = findSection('ending')      // "Ending Cash Balance"

    // Activities are nested inside "Net Change in cash" → account_transactions
    const activitySections: any[] = netChangeSection?.account_transactions ?? []
    function findActivity(kw: string): any {
      return activitySections.find((s: any) => s.name?.toLowerCase().includes(kw))
        ?? findSection(kw) // fallback: try top-level (some Zoho orgs may differ)
    }

    const opSection  = findActivity('operating')
    const invSection = findActivity('investing')
    const finSection = findActivity('financing')

    const operatingActivities = buildItems(opSection?.account_transactions ?? [])
    const totalOperating      = parseNum(opSection?.total ?? 0)
    const investingActivities = buildItems(invSection?.account_transactions ?? [])
    const totalInvesting      = parseNum(invSection?.total ?? 0)
    const financingActivities = buildItems(finSection?.account_transactions ?? [])
    const totalFinancing      = parseNum(finSection?.total ?? 0)
    const netCashChange       = parseNum(netChangeSection?.total ?? totalOperating + totalInvesting + totalFinancing)
    const openingBalance      = parseNum(openSection?.total ?? 0)
    const closingBalance      = parseNum(closeSection?.total ?? openingBalance + netCashChange)

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

  // ── Fallback: flat object format ──────────────────────────────
  const cf = raw?.cash_flow_statement ?? raw?.cashflow ?? raw?.report ?? raw ?? {}

  const operatingActivities = buildItems(cf.operating_activities?.accounts ?? cf.operating_activities?.account_transactions ?? [])
  const totalOperating      = parseNum(cf.operating_activities?.total ?? 0)
  const investingActivities = buildItems(cf.investing_activities?.accounts ?? cf.investing_activities?.account_transactions ?? [])
  const totalInvesting      = parseNum(cf.investing_activities?.total ?? 0)
  const financingActivities = buildItems(cf.financing_activities?.accounts ?? cf.financing_activities?.account_transactions ?? [])
  const totalFinancing      = parseNum(cf.financing_activities?.total ?? 0)
  const netCashChange       = parseNum(cf.net_cash ?? cf.net_change_in_cash ?? totalOperating + totalInvesting + totalFinancing)
  const openingBalance      = parseNum(cf.opening_cash_balance ?? cf.opening_balance ?? 0)
  const closingBalance      = parseNum(cf.closing_cash_balance ?? cf.closing_balance ?? openingBalance + netCashChange)
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

// ─── Concurrency limiter ──────────────────────────────────────────────────────
// Zoho enforces a per-minute API rate limit. Firing all 9 entities in one
// Promise.all saturates the limit and triggers 429s. Process in batches of 3
// with a short gap between batches to stay well under the threshold.

async function batchedMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 3,
  delayMs = 1000
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return results
}

// ─── All entities batch ───────────────────────────────────────────────────────

export async function fetchAllPL(period: FinancialPeriod): Promise<PLStatement[]> {
  return batchedMap(ORGS, (org) => fetchPLStatement(org.id, period))
}

export async function fetchAllBS(period: FinancialPeriod): Promise<BalanceSheetStatement[]> {
  return batchedMap(ORGS, (org) => fetchBSStatement(org.id, period))
}

export async function fetchAllCF(period: FinancialPeriod): Promise<CashFlowStatement[]> {
  return batchedMap(ORGS, (org) => fetchCFStatement(org.id, period))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDay(year: number, month: number): string {
  return String(new Date(year, month, 0).getDate())
}
