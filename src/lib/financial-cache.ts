/**
 * In-memory cache for financial statements.
 * TTL: 1 hour (reports are expensive to fetch — 3 API calls × 9 orgs = 27 calls per refresh)
 */

import {
  fetchAllPL,
  fetchAllBS,
  fetchAllCF,
  fetchPLStatement,
  fetchBSStatement,
  fetchCFStatement,
} from './zoho-reports'
import type {
  PLStatement,
  BalanceSheetStatement,
  CashFlowStatement,
  FinancialPeriod,
} from '@/types/financials'

const TTL = 4 * 60 * 60 * 1000 // 4 hours — reduces cold-fetch frequency

const plCache = new Map<string, { data: PLStatement[]; at: number }>()
const bsCache = new Map<string, { data: BalanceSheetStatement[]; at: number }>()
const cfCache = new Map<string, { data: CashFlowStatement[]; at: number }>()

const plSingleCache = new Map<string, { data: PLStatement; at: number }>()
const bsSingleCache = new Map<string, { data: BalanceSheetStatement; at: number }>()
const cfSingleCache = new Map<string, { data: CashFlowStatement; at: number }>()

function periodKey(period: FinancialPeriod): string {
  return [
    period.mode,
    period.year,
    period.month ?? '',
    period.quarter ?? '',
    period.half ?? '',
    period.comparison,
  ].join('_')
}

function orgPeriodKey(orgId: string, period: FinancialPeriod): string {
  return `${orgId}_${periodKey(period)}`
}

// ─── All entities ─────────────────────────────────────────────────────────────

export async function getCachedAllPL(
  period: FinancialPeriod,
  force = false
): Promise<PLStatement[]> {
  const key = periodKey(period)
  const now = Date.now()
  const cached = plCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchAllPL(period)
  plCache.set(key, { data, at: now })
  return data
}

export async function getCachedAllBS(
  period: FinancialPeriod,
  force = false
): Promise<BalanceSheetStatement[]> {
  const key = periodKey(period)
  const now = Date.now()
  const cached = bsCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchAllBS(period)
  bsCache.set(key, { data, at: now })
  return data
}

export async function getCachedAllCF(
  period: FinancialPeriod,
  force = false
): Promise<CashFlowStatement[]> {
  const key = periodKey(period)
  const now = Date.now()
  const cached = cfCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchAllCF(period)
  cfCache.set(key, { data, at: now })
  return data
}

// ─── Single entity ────────────────────────────────────────────────────────────

export async function getCachedPL(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<PLStatement> {
  const key = orgPeriodKey(orgId, period)
  const now = Date.now()
  const cached = plSingleCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchPLStatement(orgId, period)
  plSingleCache.set(key, { data, at: now })
  return data
}

export async function getCachedBS(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<BalanceSheetStatement> {
  const key = orgPeriodKey(orgId, period)
  const now = Date.now()
  const cached = bsSingleCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchBSStatement(orgId, period)
  bsSingleCache.set(key, { data, at: now })
  return data
}

export async function getCachedCF(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<CashFlowStatement> {
  const key = orgPeriodKey(orgId, period)
  const now = Date.now()
  const cached = cfSingleCache.get(key)
  if (!force && cached && now - cached.at < TTL) return cached.data
  const data = await fetchCFStatement(orgId, period)
  cfSingleCache.set(key, { data, at: now })
  return data
}

// ─── Invalidation ────────────────────────────────────────────────────────────

export function invalidateFinancialCache() {
  plCache.clear()
  bsCache.clear()
  cfCache.clear()
  plSingleCache.clear()
  bsSingleCache.clear()
  cfSingleCache.clear()
}
