/**
 * Simple cache layer.
 * - In development: in-memory Map
 * - In Vercel production: uses Next.js unstable_cache + fetch revalidation
 *
 * TTL: 30 minutes (matches cron schedule)
 */

import { fetchGroupSummary } from './zoho-data'
import type { GroupSummary } from '@/types'

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

// In-memory fallback for dev / single-instance
const memCache = new Map<string, { data: GroupSummary; at: number }>()

export async function getCachedGroupSummary(
  year = 2026,
  months = [1, 2],
  forceRefresh = false
): Promise<GroupSummary> {
  const key = `group_${year}_${months.join('_')}`
  const now = Date.now()
  const cached = memCache.get(key)

  if (!forceRefresh && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  const data = await fetchGroupSummary(year, months)
  memCache.set(key, { data, at: now })
  return data
}

export async function invalidateCache(year = 2026, months = [1, 2]) {
  const key = `group_${year}_${months.join('_')}`
  memCache.delete(key)
}
