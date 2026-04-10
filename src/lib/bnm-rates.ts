/**
 * Bank Negara Malaysia (BNM) Exchange Rate API
 *
 * Provides:
 *  - getAverageRate(currency, fromDate, toDate): avg MYR per 1 unit, used for P&L & CFS
 *  - getClosingRate(currency, asOfDate): closing MYR per 1 unit, used for Balance Sheet
 *
 * Proper IAS 21 treatment:
 *  P&L / CFS  → average rate for the period
 *  Balance Sheet → closing (spot) rate at period-end date
 *
 * Falls back to hardcoded rates in orgs.ts for currencies not available on BNM
 * (e.g., MMK, NPR, BDT).
 */

import { ORG_MAP } from './orgs'
import type { BNMRate } from '@/types/financials'

const BNM_BASE = 'https://api.bnm.gov.my/public'

// Currencies BNM regularly quotes (approximate list)
const BNM_SUPPORTED = new Set([
  'USD', 'GBP', 'EUR', 'SGD', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'NZD',
  'CHF', 'THB', 'IDR', 'PHP', 'KRW', 'TWD', 'INR', 'BND', 'AED', 'SAR',
  'VND', 'DKK', 'SEK', 'NOK',
])

// In-memory rate cache: key = "CURRENCY_YYYY-MM-DD"
const rateCache = new Map<string, number>()

// ─── BNM fetch ────────────────────────────────────────────────────────────────

async function fetchBNMRate(currency: string, date: string): Promise<number | null> {
  const cacheKey = `${currency}_${date}`
  if (rateCache.has(cacheKey)) return rateCache.get(cacheKey)!

  // BNM only quotes certain currencies
  if (!BNM_SUPPORTED.has(currency.toUpperCase())) return null

  try {
    // Try the exact date first, then walk back up to 7 days (weekends/holidays)
    for (let daysBack = 0; daysBack <= 7; daysBack++) {
      const d = new Date(date)
      d.setDate(d.getDate() - daysBack)
      const dateStr = d.toISOString().split('T')[0]

      const url = `${BNM_BASE}/exchange-rate?date=${dateStr}`
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.BNM.API.v1+json' },
        next: { revalidate: 3600 }, // cache for 1 hour at CDN
      })

      if (!res.ok) continue

      const json: any = await res.json()
      const data: any[] = json?.data ?? []

      const match = data.find(
        (r: any) => r.currency_code?.toUpperCase() === currency.toUpperCase()
      )

      if (match) {
        // Prefer middle rate; fall back to selling then buying
        const rate =
          parseFloat(match.rate?.middle ?? match.rate?.selling ?? match.rate?.buying ?? '0') ||
          null

        if (rate && rate > 0) {
          rateCache.set(cacheKey, rate)
          return rate
        }
      }
    }
    return null
  } catch (err) {
    console.warn(`BNM rate fetch failed for ${currency} on ${date}:`, err)
    return null
  }
}

// ─── Fallback from orgs config ───────────────────────────────────────────────

function getFallbackRate(currency: string): number | null {
  const org = Object.values(ORG_MAP).find(
    (o) => o.currency.toUpperCase() === currency.toUpperCase()
  )
  return org?.fxToMyr ?? null
}

// ─── Closing rate (for Balance Sheet) ────────────────────────────────────────

export async function getClosingRate(
  currency: string,
  asOfDate: string
): Promise<BNMRate> {
  if (currency.toUpperCase() === 'MYR') {
    return { currency: 'MYR', rate: 1.0, date: asOfDate, source: 'bnm' }
  }

  const bnmRate = await fetchBNMRate(currency, asOfDate)
  if (bnmRate) {
    return { currency, rate: bnmRate, date: asOfDate, source: 'bnm' }
  }

  const fallback = getFallbackRate(currency)
  return {
    currency,
    rate: fallback ?? 1.0,
    date: asOfDate,
    source: 'fallback',
  }
}

// ─── Average rate (for P&L and Cash Flow) ────────────────────────────────────

/**
 * Returns the average MYR rate for the given date range.
 * Strategy: sample the 1st, 15th, and last day of each month in the range,
 * then average. This approximates a true daily average without excessive API calls.
 */
export async function getAverageRate(
  currency: string,
  fromDate: string,
  toDate: string
): Promise<BNMRate> {
  if (currency.toUpperCase() === 'MYR') {
    return { currency: 'MYR', rate: 1.0, date: fromDate, source: 'bnm' }
  }

  if (!BNM_SUPPORTED.has(currency.toUpperCase())) {
    const fallback = getFallbackRate(currency)
    return { currency, rate: fallback ?? 1.0, date: fromDate, source: 'fallback' }
  }

  // Collect sample dates: 1st, 15th, last day of each month in range
  const sampleDates = getSampleDates(fromDate, toDate)

  const rates: number[] = []
  await Promise.all(
    sampleDates.map(async (d) => {
      const r = await fetchBNMRate(currency, d)
      if (r) rates.push(r)
    })
  )

  if (rates.length === 0) {
    const fallback = getFallbackRate(currency)
    return { currency, rate: fallback ?? 1.0, date: fromDate, source: 'fallback' }
  }

  const avg = rates.reduce((s, r) => s + r, 0) / rates.length
  return { currency, rate: avg, date: fromDate, source: 'bnm' }
}

// ─── Sample dates helper ──────────────────────────────────────────────────────

function getSampleDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = []
  const from = new Date(fromDate)
  const to = new Date(toDate)

  let cur = new Date(from.getFullYear(), from.getMonth(), 1)

  while (cur <= to) {
    const y = cur.getFullYear()
    const m = cur.getMonth()

    // 1st of month
    const first = new Date(y, m, 1)
    if (first >= from && first <= to) dates.push(fmt(first))

    // 15th of month
    const mid = new Date(y, m, 15)
    if (mid >= from && mid <= to) dates.push(fmt(mid))

    // Last day of month
    const last = new Date(y, m + 1, 0)
    if (last >= from && last <= to) dates.push(fmt(last))

    // Advance to next month
    cur = new Date(y, m + 1, 1)
  }

  return [...new Set(dates)] // deduplicate
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ─── Batch fetch for multiple currencies ─────────────────────────────────────

export async function getAverageRates(
  currencies: string[],
  fromDate: string,
  toDate: string
): Promise<Record<string, BNMRate>> {
  const entries = await Promise.all(
    currencies.map(async (c) => [c, await getAverageRate(c, fromDate, toDate)] as const)
  )
  return Object.fromEntries(entries)
}

export async function getClosingRates(
  currencies: string[],
  asOfDate: string
): Promise<Record<string, BNMRate>> {
  const entries = await Promise.all(
    currencies.map(async (c) => [c, await getClosingRate(c, asOfDate)] as const)
  )
  return Object.fromEntries(entries)
}
