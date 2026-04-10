import { fetchDashboard, fetchAnnualData } from './zoho-data'
import type { DashboardData, PeriodDef, AnnualYearData } from '@/types'

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const ANNUAL_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour for annual data

const memCache = new Map<string, { data: DashboardData; at: number }>()
const annualCache = new Map<string, { data: AnnualYearData[]; at: number }>()

function periodKey(period: PeriodDef): string {
  const now = new Date()
  const rollingKey = period.mode === 'rolling12'
    ? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    : ''
  return [
    period.mode,
    period.year,
    period.month ?? '',
    period.quarter ?? '',
    period.half ?? '',
    period.comparison ?? 'previous',
    rollingKey,
  ].join('_')
}

export async function getCachedDashboard(
  period: PeriodDef,
  forceRefresh = false
): Promise<DashboardData> {
  const key = periodKey(period)
  const now = Date.now()
  const cached = memCache.get(key)

  if (!forceRefresh && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  const data = await fetchDashboard(period, period.comparison !== 'none')
  memCache.set(key, { data, at: now })
  return data
}

export async function getCachedAnnualData(
  fromYear = 2023,
  forceRefresh = false
): Promise<AnnualYearData[]> {
  const key = `annual_${fromYear}`
  const now = Date.now()
  const cached = annualCache.get(key)

  if (!forceRefresh && cached && now - cached.at < ANNUAL_CACHE_TTL_MS) {
    return cached.data
  }

  const data = await fetchAnnualData(fromYear)
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
