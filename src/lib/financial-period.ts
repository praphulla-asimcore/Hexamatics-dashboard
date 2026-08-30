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

// ─── Query-param parsing + validation ──────────────────────────────────────
// Shared by the pl/bs/cf API routes (previously each route duplicated an
// unvalidated version of this — a bad `year`/`month`/`quarter`/`half` or an
// inverted/out-of-range custom range could reach getFinancialDateRange as
// NaN or nonsensical values instead of being rejected with a clear 4xx).

const VALID_MODES = ['month', 'quarter', 'half', 'year', 'custom'] as const
const VALID_COMPARISONS = ['previous', 'yoy', 'none'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MIN_FINANCIAL_YEAR = 2023

export function parsePeriodFromParams(
  sp: URLSearchParams
): { period: FinancialPeriod; error?: undefined } | { period?: undefined; error: string } {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const maxDate = now.toISOString().slice(0, 10)

  const modeRaw = sp.get('mode') ?? 'month'
  if (!(VALID_MODES as readonly string[]).includes(modeRaw)) {
    return { error: `Invalid mode "${modeRaw}"; expected one of ${VALID_MODES.join(', ')}` }
  }
  const mode = modeRaw as FinancialPeriod['mode']

  const comparisonRaw = sp.get('comparison') ?? 'previous'
  if (!(VALID_COMPARISONS as readonly string[]).includes(comparisonRaw)) {
    return { error: `Invalid comparison "${comparisonRaw}"; expected one of ${VALID_COMPARISONS.join(', ')}` }
  }
  const comparison = comparisonRaw as FinancialPeriod['comparison']

  if (mode === 'custom') {
    const customFrom = sp.get('customFrom') ?? undefined
    const customTo = sp.get('customTo') ?? undefined
    if (!customFrom || !customTo) {
      return { error: 'customFrom and customTo are both required for mode=custom' }
    }
    if (!ISO_DATE.test(customFrom) || !ISO_DATE.test(customTo)) {
      return { error: 'customFrom/customTo must be YYYY-MM-DD' }
    }
    if (customFrom > customTo) {
      return { error: 'customFrom must not be after customTo' }
    }
    if (customFrom < MIN_FINANCIAL_DATE || customTo > maxDate) {
      return { error: `customFrom/customTo must fall within ${MIN_FINANCIAL_DATE} and ${maxDate}` }
    }
    const year = parseInt(customFrom.slice(0, 4), 10)
    return { period: { mode, year, comparison, customFrom, customTo } }
  }

  const yearRaw = sp.get('year') ?? String(currentYear)
  const year = parseInt(yearRaw, 10)
  if (!Number.isFinite(year) || String(year) !== yearRaw.trim() || year < MIN_FINANCIAL_YEAR || year > currentYear) {
    return { error: `year must be an integer between ${MIN_FINANCIAL_YEAR} and ${currentYear}` }
  }

  if (mode === 'month') {
    const monthRaw = sp.get('month') ?? String(currentMonth)
    const month = parseInt(monthRaw, 10)
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return { error: 'month must be an integer between 1 and 12' }
    }
    if (year === currentYear && month > currentMonth) {
      return { error: 'month is in the future' }
    }
    return { period: { mode, year, month, comparison } }
  }

  if (mode === 'quarter') {
    const quarterRaw = sp.get('quarter') ?? '1'
    const quarter = parseInt(quarterRaw, 10)
    if (![1, 2, 3, 4].includes(quarter)) {
      return { error: 'quarter must be 1, 2, 3, or 4' }
    }
    const maxQuarter = year === currentYear ? Math.ceil(currentMonth / 3) : 4
    if (quarter > maxQuarter) {
      return { error: 'quarter is in the future' }
    }
    return { period: { mode, year, quarter: quarter as 1 | 2 | 3 | 4, comparison } }
  }

  if (mode === 'half') {
    const halfRaw = sp.get('half') ?? '1'
    const half = parseInt(halfRaw, 10)
    if (![1, 2].includes(half)) {
      return { error: 'half must be 1 or 2' }
    }
    const maxHalf = year === currentYear && currentMonth <= 6 ? 1 : 2
    if (half > maxHalf) {
      return { error: 'half is in the future' }
    }
    return { period: { mode, year, half: half as 1 | 2, comparison } }
  }

  // mode === 'year'
  return { period: { mode, year, comparison } }
}
