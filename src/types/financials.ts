// ─── Financial Period ────────────────────────────────────────────────────────

export interface FinancialPeriod {
  mode: 'month' | 'quarter' | 'half' | 'year'
  year: number
  month?: number           // 1–12 for mode='month'
  quarter?: 1 | 2 | 3 | 4 // for mode='quarter'
  half?: 1 | 2             // for mode='half'
  comparison: 'previous' | 'yoy' | 'none'
}

// ─── Generic Line Item ────────────────────────────────────────────────────────

export interface FSLineItem {
  account: string
  accountId?: string
  amount: number       // local currency
  amountMyr?: number   // converted at applicable FX rate
  subItems?: FSLineItem[]
  isTotal?: boolean    // subtotal / total row (bold)
  isHeader?: boolean   // section header row (no amount)
}

// ─── Profit & Loss ────────────────────────────────────────────────────────────

export interface PLData {
  revenue: FSLineItem[]
  totalRevenue: number

  cogs: FSLineItem[]
  totalCogs: number

  grossProfit: number
  grossMargin: number      // %

  operatingExpenses: FSLineItem[]
  totalOpex: number

  ebitda: number
  ebitdaMargin: number     // %

  depreciation: number
  amortization: number

  ebit: number
  ebitMargin: number       // %

  otherIncome: FSLineItem[]
  totalOtherIncome: number

  otherExpenses: FSLineItem[]
  totalOtherExpenses: number

  ebt: number              // earnings before tax
  ebtMargin: number        // %

  tax: FSLineItem[]
  totalTax: number

  netProfit: number
  netMargin: number        // %
}

export interface PLStatement {
  orgId: string
  orgShort: string
  orgName: string
  currency: string
  fxRate: number           // avg rate: 1 local unit → MYR
  dateRange: { from: string; to: string }
  data: PLData
  comparison?: PLData
  comparisonFxRate?: number
  comparisonDateRange?: { from: string; to: string }
  error?: string           // non-fatal: show partial data + warning
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

export interface BSData {
  currentAssets: FSLineItem[]
  totalCurrentAssets: number

  nonCurrentAssets: FSLineItem[]
  totalNonCurrentAssets: number

  totalAssets: number

  currentLiabilities: FSLineItem[]
  totalCurrentLiabilities: number

  nonCurrentLiabilities: FSLineItem[]
  totalNonCurrentLiabilities: number

  totalLiabilities: number

  equity: FSLineItem[]
  totalEquity: number

  totalLiabilitiesAndEquity: number

  // Key ratios (derived)
  currentRatio: number
  quickRatio: number
  debtToEquity: number
  workingCapital: number
  netDebt: number
}

export interface BalanceSheetStatement {
  orgId: string
  orgShort: string
  orgName: string
  currency: string
  fxRate: number           // closing rate at period end
  asOfDate: string
  data: BSData
  comparison?: BSData
  comparisonFxRate?: number
  comparisonDate?: string
  error?: string
}

// ─── Cash Flow Statement ──────────────────────────────────────────────────────

export interface CFData {
  operatingActivities: FSLineItem[]
  totalOperating: number

  investingActivities: FSLineItem[]
  totalInvesting: number

  financingActivities: FSLineItem[]
  totalFinancing: number

  netCashChange: number
  openingBalance: number
  closingBalance: number

  freeCashFlow: number     // operating − capex
  cashConversionRate: number // FCF / net profit %
}

export interface CashFlowStatement {
  orgId: string
  orgShort: string
  orgName: string
  currency: string
  fxRate: number           // avg rate for period
  dateRange: { from: string; to: string }
  data: CFData
  comparison?: CFData
  comparisonFxRate?: number
  comparisonDateRange?: { from: string; to: string }
  error?: string
}

// ─── Consolidated Views ───────────────────────────────────────────────────────

export interface ConsolidatedPL {
  periodLabel: string
  dateRange: { from: string; to: string }
  entities: PLStatement[]
  group: {
    totalRevenueMyr: number
    totalCogsMyr: number
    grossProfitMyr: number
    grossMarginPct: number
    totalOpexMyr: number
    ebitdaMyr: number
    ebitdaMarginPct: number
    ebitMyr: number
    ebitMarginPct: number
    netProfitMyr: number
    netMarginPct: number
  }
  comparison?: ConsolidatedPL
}

export interface ConsolidatedBS {
  asOfDate: string
  entities: BalanceSheetStatement[]
  group: {
    totalAssetsMyr: number
    totalLiabilitiesMyr: number
    totalEquityMyr: number
    currentRatio: number
    debtToEquity: number
    workingCapitalMyr: number
  }
  comparison?: ConsolidatedBS
}

export interface ConsolidatedCF {
  dateRange: { from: string; to: string }
  entities: CashFlowStatement[]
  group: {
    totalOperatingMyr: number
    totalInvestingMyr: number
    totalFinancingMyr: number
    netCashChangeMyr: number
    freeCashFlowMyr: number
  }
  comparison?: ConsolidatedCF
}

// ─── BNM Rate ────────────────────────────────────────────────────────────────

export interface BNMRate {
  currency: string
  rate: number       // MYR per 1 unit of foreign currency
  date: string
  source: 'bnm' | 'fallback'
}

// ─── CFO Insight ─────────────────────────────────────────────────────────────

export type InsightLevel = 'critical' | 'warning' | 'positive' | 'info'

export interface CFOInsight {
  level: InsightLevel
  category: string    // 'Revenue' | 'Profitability' | 'Cash Flow' | 'Balance Sheet' etc
  headline: string
  detail: string
}
