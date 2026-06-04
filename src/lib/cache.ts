import { fetchDashboard, fetchAnnualData } from './zoho-data'
import { pgGet as kvGet, pgSet as kvSet } from './pg-cache'
import type { DashboardData, PeriodDef, AnnualYearData } from '@/types'

const CACHE_TTL_MS      = 30 * 60 * 1000  // 30 minutes
const CACHE_TTL_SECONDS = 30 * 60
const ANNUAL_TTL_MS     = 60 * 60 * 1000  // 1 hour
const ANNUAL_TTL_SECONDS = 60 * 60

const memCache    = new Map<string, { data: DashboardData;    at: number }>()
const annualCache = new Map<string, { data: AnnualYearData[]; at: number }>()

function periodKey(period: PeriodDef): string {
  const now = new Date()
  const rollingKey = period.mode === 'rolling12'
    ? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    : ''
  return [
    period.mode,
    period.year,
    period.month      ?? '',
    period.quarter    ?? '',
    period.half       ?? '',
    period.comparison ?? 'previous',
    rollingKey,
    period.customFrom ?? '',
    period.customTo   ?? '',
  ].join('_')
}

export async function getCachedDashboard(
  period: PeriodDef,
  forceRefresh = false
): Promise<DashboardData> {
  const key    = periodKey(period)
  const kvKey  = `ar:dashboard:${key}`
  const now    = Date.now()

  if (!forceRefresh) {
    const kv = await kvGet<DashboardData>(kvKey)
    if (kv) { memCache.set(key, { data: kv, at: now }); return kv }

    const mem = memCache.get(key)
    if (mem && now - mem.at < CACHE_TTL_MS) return mem.data
  }

  const data = await fetchDashboard(period, period.comparison !== 'none')
  await kvSet(kvKey, data, CACHE_TTL_SECONDS)
  memCache.set(key, { data, at: now })
  return data
}

export async function getCachedAnnualData(
  fromYear = 2023,
  forceRefresh = false
): Promise<AnnualYearData[]> {
  const key   = `annual_${fromYear}`
  const kvKey = `ar:annual:${key}`
  const now   = Date.now()

  if (!forceRefresh) {
    const kv = await kvGet<AnnualYearData[]>(kvKey)
    if (kv) { annualCache.set(key, { data: kv, at: now }); return kv }

    const mem = annualCache.get(key)
    if (mem && now - mem.at < ANNUAL_TTL_MS) return mem.data
  }

  const data = await fetchAnnualData(fromYear)
  await kvSet(kvKey, data, ANNUAL_TTL_SECONDS)
  annualCache.set(key, { data, at: now })
  return data
}

export function invalidateCache(period?: PeriodDef) {
  if (period) {
    memCache.delete(periodKey(period))
  } else {
    memCache.clear()
    annualCache.clear()
  }
}

// Legacy compat
export async function getCachedGroupSummary(
  year = 2026,
  months = [1, 2],
  forceRefresh = false
): Promise<DashboardData> {
  const period: PeriodDef = { mode: 'month', year, month: months[months.length - 1] }
  return getCachedDashboard(period, forceRefresh)
}
