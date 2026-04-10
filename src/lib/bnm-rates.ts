/**
 * Bank Negara Malaysia (BNM) Exchange Rate API
 *
 * Provides MYR conversion rates for IAS 21 treatment:
 *  - P&L / CFS  → average rate for the period (getAverageRate)
 *  - Balance Sheet → closing rate at period-end (getClosingRate)
 *
 * BNM public API returns today's rates only (no historical endpoint).
 * All calls return current market rates as the best available approximation.
 *
 * Confirmed field names from live API:
 *   { currency_code, unit, rate: { date, buying_rate, selling_rate, middle_rate } }
 *
 * Unit handling: some currencies are quoted per 100 units (e.g. IDR, PHP, NPR, MMK).
 * Always divide middle_rate by unit to get the per-1-unit MYR rate.
 *
 * Currencies NOT on BNM (use orgs.ts fallback): BDT
 */

import { ORG_MAP } from './orgs'
import type { BNMRate } from '@/types/financials'

const BNM_BASE = 'https://api.bnm.gov.my/public'

// All currencies confirmed present in the BNM API response
const BNM_SUPPORTED = new Set([
  'USD', 'GBP', 'EUR', 'SGD', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'NZD',
  'CHF', 'THB', 'IDR', 'PHP', 'KRW', 'TWD', 'INR', 'BND', 'AED', 'SAR',
  'VND', 'DKK', 'SEK', 'NOK', 'NPR', 'MMK', 'PKR', 'KHR', 'EGP', 'SDR',
])

// In-memory cache — keyed by currency so we fetch the full list once per process
let cachedRates: Map<string, number> | null = null
let cacheTime = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// ─── Fetch & cache all rates in one call ──────────────────────────────────────

async function getAllRates(): Promise<Map<string, number>> {
  const now = Date.now()
  if (cachedRates && now - cacheTime < CACHE_TTL_MS) return cachedRates

  try {
    const res = await fetch(`${BNM_BASE}/exchange-rate`, {
      headers: { Accept: 'application/vnd.BNM.API.v1+json' },
      // Next.js revalidation — 1 hour CDN cache on top of in-memory cache
      next: { revalidate: 3600 },
    })

    if (!res.ok) throw new Error(`BNM API ${res.status}`)

    const json: any = await res.json()
    const data: any[] = json?.data ?? []

    const map = new Map<string, number>()
    for (const r of data) {
      const code: string = r.currency_code?.toUpperCase()
      const unit: number = Number(r.unit) || 1
      // Use middle_rate, fall back to selling_rate then buying_rate
      const raw: number =
        r.rate?.middle_rate ?? r.rate?.selling_rate ?? r.rate?.buying_rate ?? 0
      if (code && raw > 0) {
        // Divide by unit: e.g. IDR unit=100 means rate is per 100 IDR → per 1 IDR
        map.set(code, raw / unit)
      }
    }

    cachedRates = map
    cacheTime = now
    return map
  } catch (err) {
    console.warn('BNM rate fetch failed:', err)
    return cachedRates ?? new Map()
  }
}

// ─── Fallback from orgs config ───────────────────────────────────────────────

function getFallbackRate(currency: string): number | null {
  const org = Object.values(ORG_MAP).find(
    (o) => o.currency.toUpperCase() === currency.toUpperCase()
  )
  return org?.fxToMyr ?? null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Closing rate for Balance Sheet (IAS 21: spot rate at period-end) */
export async function getClosingRate(
  currency: string,
  asOfDate: string
): Promise<BNMRate> {
  if (currency.toUpperCase() === 'MYR') {
    return { currency: 'MYR', rate: 1.0, date: asOfDate, source: 'bnm' }
  }

  if (BNM_SUPPORTED.has(currency.toUpperCase())) {
    const rates = await getAllRates()
    const rate = rates.get(currency.toUpperCase())
    if (rate && rate > 0) {
      return { currency, rate, date: asOfDate, source: 'bnm' }
    }
  }

  const fallback = getFallbackRate(currency)
  return { currency, rate: fallback ?? 1.0, date: asOfDate, source: 'fallback' }
}

/** Average rate for P&L and Cash Flow (IAS 21: average for the period) */
export async function getAverageRate(
  currency: string,
  fromDate: string,
  toDate: string
): Promise<BNMRate> {
  if (currency.toUpperCase() === 'MYR') {
    return { currency: 'MYR', rate: 1.0, date: fromDate, source: 'bnm' }
  }

  if (BNM_SUPPORTED.has(currency.toUpperCase())) {
    const rates = await getAllRates()
    const rate = rates.get(currency.toUpperCase())
    if (rate && rate > 0) {
      return { currency, rate, date: fromDate, source: 'bnm' }
    }
  }

  const fallback = getFallbackRate(currency)
  return { currency, rate: fallback ?? 1.0, date: fromDate, source: 'fallback' }
}

// ─── Batch helpers ────────────────────────────────────────────────────────────

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
