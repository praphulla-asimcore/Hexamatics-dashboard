import { fetchDashboard, getPeriodLabel } from './zoho-data'
import type { DashboardData, PeriodDef } from '@/types'

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

const memCache = new Map<string, { data: DashboardData; at: number }>()

function periodKey(period: PeriodDef): string {
  return `${period.mode}_${period.year}_${period.month ?? ''}_${period.quarter ?? ''}`
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

  const data = await fetchDashboard(period, true)
  memCache.set(key, { data, at: now })
  return data
}

export function invalidateCache(period?: PeriodDef) {
  if (period) {
    memCache.delete(periodKey(period))
  } else {
    memCache.clear()
  }
}

// Legacy compat for old cron route
export async function getCachedGroupSummary(
  year = 2026,
  months = [1, 2],
  forceRefresh = false
): Promise<DashboardData> {
  const period: PeriodDef = { mode: 'month', year, month: months[months.length - 1] }
  return getCachedDashboard(period, forceRefresh)
}
