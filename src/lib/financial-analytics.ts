/**
 * CFO-grade financial analytics engine.
 *
 * Generates actionable insights, flags risks, and computes consolidated
 * group metrics from entity-level financial statement data.
 */

import type {
  PLStatement,
  BalanceSheetStatement,
  CashFlowStatement,
  ConsolidatedPL,
  ConsolidatedBS,
  ConsolidatedCF,
  CFOInsight,
  InsightLevel,
} from '@/types/financials'

// ─── Consolidated P&L ─────────────────────────────────────────────────────────

export function buildConsolidatedPL(
  entities: PLStatement[],
  periodLabel: string
): ConsolidatedPL {
  const valid = entities.filter((e) => !e.error)

  function sumMyr(fn: (e: PLStatement) => number) {
    return valid.reduce((s, e) => s + fn(e) * e.fxRate, 0)
  }

  const totalRevenueMyr = sumMyr((e) => e.data.totalRevenue)
  const totalCogsMyr = sumMyr((e) => e.data.totalCogs)
  const grossProfitMyr = totalRevenueMyr - totalCogsMyr
  const grossMarginPct = totalRevenueMyr > 0 ? (grossProfitMyr / totalRevenueMyr) * 100 : 0
  const totalOpexMyr = sumMyr((e) => e.data.totalOpex)
  const ebitdaMyr = grossProfitMyr - totalOpexMyr
  const ebitdaMarginPct = totalRevenueMyr > 0 ? (ebitdaMyr / totalRevenueMyr) * 100 : 0
  const ebitMyr = ebitdaMyr - sumMyr((e) => e.data.depreciation + e.data.amortization)
  const ebitMarginPct = totalRevenueMyr > 0 ? (ebitMyr / totalRevenueMyr) * 100 : 0
  const netProfitMyr = sumMyr((e) => e.data.netProfit)
  const netMarginPct = totalRevenueMyr > 0 ? (netProfitMyr / totalRevenueMyr) * 100 : 0

  const dateRange = valid[0]?.dateRange ?? { from: '', to: '' }

  return {
    periodLabel,
    dateRange,
    entities,
    group: {
      totalRevenueMyr, totalCogsMyr, grossProfitMyr, grossMarginPct,
      totalOpexMyr, ebitdaMyr, ebitdaMarginPct, ebitMyr, ebitMarginPct,
      netProfitMyr, netMarginPct,
    },
  }
}

// ─── Consolidated BS ──────────────────────────────────────────────────────────

export function buildConsolidatedBS(
  entities: BalanceSheetStatement[],
  asOfDate: string
): ConsolidatedBS {
  const valid = entities.filter((e) => !e.error)

  function sumMyr(fn: (e: BalanceSheetStatement) => number) {
    return valid.reduce((s, e) => s + fn(e) * e.fxRate, 0)
  }

  const totalAssetsMyr = sumMyr((e) => e.data.totalAssets)
  const totalLiabilitiesMyr = sumMyr((e) => e.data.totalLiabilities)
  const totalEquityMyr = sumMyr((e) => e.data.totalEquity)
  const currentAssetsMyr = sumMyr((e) => e.data.totalCurrentAssets)
  const currentLiabsMyr = sumMyr((e) => e.data.totalCurrentLiabilities)
  const currentRatio = currentLiabsMyr > 0 ? currentAssetsMyr / currentLiabsMyr : 0
  const debtToEquity = totalEquityMyr !== 0 ? totalLiabilitiesMyr / Math.abs(totalEquityMyr) : 0
  const workingCapitalMyr = currentAssetsMyr - currentLiabsMyr

  return {
    asOfDate, entities,
    group: {
      totalAssetsMyr, totalLiabilitiesMyr, totalEquityMyr,
      currentRatio, debtToEquity, workingCapitalMyr,
    },
  }
}

// ─── Consolidated CF ──────────────────────────────────────────────────────────

export function buildConsolidatedCF(
  entities: CashFlowStatement[],
): ConsolidatedCF {
  const valid = entities.filter((e) => !e.error)

  function sumMyr(fn: (e: CashFlowStatement) => number) {
    return valid.reduce((s, e) => s + fn(e) * e.fxRate, 0)
  }

  const totalOperatingMyr = sumMyr((e) => e.data.totalOperating)
  const totalInvestingMyr = sumMyr((e) => e.data.totalInvesting)
  const totalFinancingMyr = sumMyr((e) => e.data.totalFinancing)
  const netCashChangeMyr = totalOperatingMyr + totalInvestingMyr + totalFinancingMyr
  const freeCashFlowMyr = sumMyr((e) => e.data.freeCashFlow)
  const dateRange = valid[0]?.dateRange ?? { from: '', to: '' }

  return {
    dateRange, entities,
    group: {
      totalOperatingMyr, totalInvestingMyr, totalFinancingMyr,
      netCashChangeMyr, freeCashFlowMyr,
    },
  }
}

// ─── CFO Insights: P&L ────────────────────────────────────────────────────────

export function generatePLInsights(consolidated: ConsolidatedPL): CFOInsight[] {
  const insights: CFOInsight[] = []
  const { group, entities } = consolidated
  const prev = consolidated.comparison?.group

  // Revenue growth
  if (prev && prev.totalRevenueMyr > 0) {
    const growth = ((group.totalRevenueMyr - prev.totalRevenueMyr) / prev.totalRevenueMyr) * 100
    insights.push({
      level: growth >= 10 ? 'positive' : growth >= 0 ? 'info' : growth >= -10 ? 'warning' : 'critical',
      category: 'Revenue',
      headline: `Group revenue ${growth >= 0 ? 'grew' : 'declined'} ${Math.abs(growth).toFixed(1)}% vs prior period`,
      detail: `Current: MYR ${fmt(group.totalRevenueMyr)}  |  Prior: MYR ${fmt(prev.totalRevenueMyr)}`,
    })
  }

  // Gross margin
  if (group.grossMarginPct < 20) {
    insights.push({
      level: 'critical',
      category: 'Profitability',
      headline: `Gross margin critically low at ${group.grossMarginPct.toFixed(1)}%`,
      detail: 'COGS is consuming most of revenue. Review pricing and direct cost structure.',
    })
  } else if (prev && group.grossMarginPct < prev.grossMarginPct - 3) {
    insights.push({
      level: 'warning',
      category: 'Profitability',
      headline: `Gross margin compressed by ${(prev.grossMarginPct - group.grossMarginPct).toFixed(1)}bp`,
      detail: `Margin declined from ${prev.grossMarginPct.toFixed(1)}% to ${group.grossMarginPct.toFixed(1)}%. Check for price pressure or cost escalation.`,
    })
  } else if (group.grossMarginPct >= 40) {
    insights.push({
      level: 'positive',
      category: 'Profitability',
      headline: `Strong gross margin of ${group.grossMarginPct.toFixed(1)}%`,
      detail: 'Group maintains healthy pricing power and cost control.',
    })
  }

  // EBITDA margin
  if (group.ebitdaMarginPct < 0) {
    insights.push({
      level: 'critical',
      category: 'Profitability',
      headline: `Negative EBITDA: MYR ${fmt(group.ebitdaMyr)} (${group.ebitdaMarginPct.toFixed(1)}% margin)`,
      detail: 'Operating expenses exceed gross profit. Immediate cost review required.',
    })
  } else if (group.ebitdaMarginPct < 10) {
    insights.push({
      level: 'warning',
      category: 'Profitability',
      headline: `EBITDA margin thin at ${group.ebitdaMarginPct.toFixed(1)}%`,
      detail: 'Limited buffer for interest, tax, and capex. Review opex efficiency.',
    })
  }

  // Net margin
  if (group.netMarginPct < 0) {
    insights.push({
      level: 'critical',
      category: 'Profitability',
      headline: `Group net loss: MYR ${fmt(Math.abs(group.netProfitMyr))}`,
      detail: `Net margin at ${group.netMarginPct.toFixed(1)}%. Sustained losses will erode equity.`,
    })
  }

  // Top performing entity
  const sorted = [...entities]
    .filter((e) => !e.error && e.data.totalRevenue > 0)
    .sort((a, b) => b.data.netMargin - a.data.netMargin)
  if (sorted.length > 0) {
    const top = sorted[0]
    insights.push({
      level: 'info',
      category: 'Entity Performance',
      headline: `${top.orgShort} is the most profitable entity at ${top.data.netMargin.toFixed(1)}% net margin`,
      detail: `Revenue: ${top.currency} ${fmt(top.data.totalRevenue)}  |  Net Profit: ${top.currency} ${fmt(top.data.netProfit)}`,
    })
  }

  // Loss-making entities
  const lossEntities = entities.filter((e) => !e.error && e.data.netProfit < 0)
  if (lossEntities.length > 0) {
    insights.push({
      level: 'warning',
      category: 'Entity Risk',
      headline: `${lossEntities.length} entit${lossEntities.length > 1 ? 'ies' : 'y'} reporting net losses`,
      detail: lossEntities.map((e) => `${e.orgShort}: ${e.currency} ${fmt(Math.abs(e.data.netProfit))} loss`).join('  |  '),
    })
  }

  return insights
}

// ─── CFO Insights: Balance Sheet ─────────────────────────────────────────────

export function generateBSInsights(consolidated: ConsolidatedBS): CFOInsight[] {
  const insights: CFOInsight[] = []
  const { group, entities } = consolidated

  // Liquidity
  if (group.currentRatio < 1.0) {
    insights.push({
      level: 'critical',
      category: 'Liquidity',
      headline: `Group current ratio below 1.0 (${group.currentRatio.toFixed(2)}x) — liquidity risk`,
      detail: 'Current liabilities exceed current assets. Short-term obligations may not be met.',
    })
  } else if (group.currentRatio < 1.5) {
    insights.push({
      level: 'warning',
      category: 'Liquidity',
      headline: `Current ratio ${group.currentRatio.toFixed(2)}x — tight liquidity`,
      detail: 'Maintain close watch on cash flow. Consider extending credit facilities.',
    })
  } else {
    insights.push({
      level: 'positive',
      category: 'Liquidity',
      headline: `Healthy liquidity: current ratio ${group.currentRatio.toFixed(2)}x`,
      detail: `Working capital of MYR ${fmt(group.workingCapitalMyr)} provides adequate buffer.`,
    })
  }

  // Leverage
  if (group.debtToEquity > 2.0) {
    insights.push({
      level: 'critical',
      category: 'Capital Structure',
      headline: `High leverage: debt-to-equity ${group.debtToEquity.toFixed(2)}x`,
      detail: 'Group is significantly debt-financed. Review debt covenants and refinancing options.',
    })
  } else if (group.debtToEquity > 1.0) {
    insights.push({
      level: 'warning',
      category: 'Capital Structure',
      headline: `Moderate leverage: D/E ratio ${group.debtToEquity.toFixed(2)}x`,
      detail: 'Debt is higher than equity. Monitor interest coverage ratio.',
    })
  }

  // Equity
  if (group.totalEquityMyr < 0) {
    insights.push({
      level: 'critical',
      category: 'Capital Structure',
      headline: `Negative equity: MYR ${fmt(Math.abs(group.totalEquityMyr))} — technical insolvency risk`,
      detail: 'Accumulated losses have eroded the equity base. Urgent capital review required.',
    })
  }

  // Entity-level risks
  const negEquity = entities.filter((e) => !e.error && e.data.totalEquity < 0)
  if (negEquity.length > 0) {
    insights.push({
      level: 'warning',
      category: 'Entity Risk',
      headline: `${negEquity.length} entit${negEquity.length > 1 ? 'ies' : 'y'} with negative equity`,
      detail: negEquity.map((e) => e.orgShort).join(', '),
    })
  }

  return insights
}

// ─── CFO Insights: Cash Flow ─────────────────────────────────────────────────

export function generateCFInsights(consolidated: ConsolidatedCF): CFOInsight[] {
  const insights: CFOInsight[] = []
  const { group } = consolidated

  // Operating cash flow
  if (group.totalOperatingMyr < 0) {
    insights.push({
      level: 'critical',
      category: 'Cash Generation',
      headline: `Negative operating cash flow: MYR ${fmt(Math.abs(group.totalOperatingMyr))}`,
      detail: 'Core operations are consuming cash. Review working capital and collections.',
    })
  } else {
    insights.push({
      level: 'positive',
      category: 'Cash Generation',
      headline: `Positive operating cash flow: MYR ${fmt(group.totalOperatingMyr)}`,
      detail: 'Group is generating cash from operations.',
    })
  }

  // Free cash flow
  if (group.freeCashFlowMyr < 0) {
    insights.push({
      level: 'warning',
      category: 'Free Cash Flow',
      headline: `Negative FCF: MYR ${fmt(Math.abs(group.freeCashFlowMyr))}`,
      detail: 'After capex, the group is consuming cash. Verify capex is growth-oriented.',
    })
  } else {
    insights.push({
      level: 'positive',
      category: 'Free Cash Flow',
      headline: `Strong FCF: MYR ${fmt(group.freeCashFlowMyr)}`,
      detail: 'Group generates free cash for dividends, debt repayment, or reinvestment.',
    })
  }

  // Investing activities
  if (group.totalInvestingMyr < -500_000) {
    insights.push({
      level: 'info',
      category: 'Capital Allocation',
      headline: `Significant investment outflows: MYR ${fmt(Math.abs(group.totalInvestingMyr))}`,
      detail: 'Group is actively investing. Confirm ROI expectations and project timelines.',
    })
  }

  // Financing
  if (group.totalFinancingMyr > 500_000) {
    insights.push({
      level: 'info',
      category: 'Financing',
      headline: `Net borrowing: MYR ${fmt(group.totalFinancingMyr)}`,
      detail: 'Group raised new debt or equity. Review terms and covenant compliance.',
    })
  } else if (group.totalFinancingMyr < -500_000) {
    insights.push({
      level: 'positive',
      category: 'Financing',
      headline: `Net debt repayment: MYR ${fmt(Math.abs(group.totalFinancingMyr))}`,
      detail: 'Group is deleveraging — positive signal for balance sheet health.',
    })
  }

  return insights
}

// ─── Number formatter ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : Math.abs(n) >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : n.toFixed(0)
}

// ─── Variance helpers ────────────────────────────────────────────────────────

export function variance(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / Math.abs(prior)) * 100
}

export function varianceLabel(pct: number): string {
  if (pct === 0) return '—'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

export function insightColor(level: InsightLevel): string {
  switch (level) {
    case 'critical': return 'text-red-400 bg-red-950/40 border-red-900'
    case 'warning':  return 'text-amber-400 bg-amber-950/40 border-amber-900'
    case 'positive': return 'text-emerald-400 bg-emerald-950/40 border-emerald-900'
    case 'info':     return 'text-blue-400 bg-blue-950/40 border-blue-900'
  }
}

export function insightIcon(level: InsightLevel): string {
  switch (level) {
    case 'critical': return '⚠'
    case 'warning':  return '◆'
    case 'positive': return '✓'
    case 'info':     return '●'
  }
}
