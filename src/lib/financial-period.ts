/**
 * Pure date/label helpers for FinancialPeriod — no Zoho or DB imports.
 *
 * Kept separate from zoho-reports.ts so client components (e.g.
 * FinancialsClient.tsx) can import getFinancialPeriodLabel without pulling
 * in zoho-auth -> pg-cache -> pg, which breaks the browser bundle (pg needs
 * Node core modules like fs/net/tls/dns).
 */

import type { FinancialPeriod } from '@/types/financials'

const MIN_FINANCIAL_DATE = '2023-01-01'

export function getFinancialDateRange(period: FinancialPeriod): { from: string; to: string } {
  const { mode, year, month, quarter, half } = period
  const now = new Date()
  const maxDate = now.toISOString().slice(0, 10)

  if (period.mode === 'custom' && period.customFrom && period.customTo) {
    const from = period.customFrom < MIN_FINANCIAL_DATE ? MIN_FINANCIAL_DATE : period.customFrom
    const to = period.customTo > maxDate ? maxDate : period.customTo
    return { from, to }
  }

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
  // year — stop at last complete month (matches AR ytd; avoids partial current-month data)
  const endM = year < now.getFullYear() ? 12 : Math.max(now.getMonth(), 1)
  return { from: `${year}-01-01`, to: `${year}-${pad(endM)}-${lastDay(year, endM)}` }
}

export function getComparisonPeriod(period: FinancialPeriod): FinancialPeriod | null {
  if (period.comparison === 'none') return null
  if (period.mode === 'custom') return null
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
  if (period.mode === 'custom' && period.customFrom && period.customTo) return `${period.customFrom} – ${period.customTo}`
  if (period.mode === 'month' && period.month) return `${MONTHS[period.month - 1]} ${period.year}`
  if (period.mode === 'quarter' && period.quarter) return `Q${period.quarter} ${period.year}`
  if (period.mode === 'half') return `H${period.half ?? 1} ${period.year}`
  return `FY ${period.year}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDay(year: number, month: number): string {
  return String(new Date(year, month, 0).getDate())
}
