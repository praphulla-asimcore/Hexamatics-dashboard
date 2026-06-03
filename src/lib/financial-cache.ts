/**
 * Two-level cache for financial statements.
 *
 * L1 — Vercel KV (Redis): shared across ALL Lambda instances, survives redeploys.
 *      Active in production when KV_REST_API_URL + KV_REST_API_TOKEN are set.
 * L2 — In-memory Map: local dev fallback and same-instance speed-up.
 *
 * TTL: 4 hours. A cron job at /api/cron/warm re-warms every 3 hours so users
 * virtually always hit the KV cache and see sub-second page loads.
 */

import { kvGet, kvSet } from './kv'
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

const TTL_MS      = 4 * 60 * 60 * 1000  // 4 hours (milliseconds, for in-memory)
const TTL_SECONDS = 4 * 60 * 60          // 4 hours (seconds, for KV ex option)

// ── In-memory L2 cache (per Lambda instance) ──────────────────────────────────
const plCache  = new Map<string, { data: PLStatement[];            at: number }>()
const bsCache  = new Map<string, { data: BalanceSheetStatement[]; at: number }>()
const cfCache  = new Map<string, { data: CashFlowStatement[];      at: number }>()

const plSingleCache = new Map<string, { data: PLStatement;            at: number }>()
const bsSingleCache = new Map<string, { data: BalanceSheetStatement; at: number }>()
const cfSingleCache = new Map<string, { data: CashFlowStatement;     at: number }>()

function periodKey(period: FinancialPeriod): string {
  return [
    period.mode,
    period.year,
    period.month      ?? '',
    period.quarter    ?? '',
    period.half       ?? '',
    period.comparison,
    period.customFrom ?? '',
    period.customTo   ?? '',
  ].join('_')
}

function orgPeriodKey(orgId: string, period: FinancialPeriod): string {
  return `${orgId}_${periodKey(period)}`
}

// ── Generic read-through helper ───────────────────────────────────────────────
async function readThrough<T>(opts: {
  kvKey:     string
  memCache:  Map<string, { data: T; at: number }>
  memKey:    string
  force:     boolean
  fetch:     () => Promise<T>
}): Promise<T> {
  const { kvKey, memCache, memKey, force, fetch } = opts
  const now = Date.now()

  if (!force) {
    // L1: KV
    const kv = await kvGet<T>(kvKey)
    if (kv !== null) {
      memCache.set(memKey, { data: kv, at: now }) // backfill L2
      return kv
    }
    // L2: in-memory
    const mem = memCache.get(memKey)
    if (mem && now - mem.at < TTL_MS) return mem.data
  }

  const data = await fetch()
  await kvSet(kvKey, data, TTL_SECONDS)
  memCache.set(memKey, { data, at: now })
  return data
}

// ── All-entity fetchers ───────────────────────────────────────────────────────

export async function getCachedAllPL(
  period: FinancialPeriod,
  force = false
): Promise<PLStatement[]> {
  const key = periodKey(period)
  return readThrough({
    kvKey:    `fin:pl:all:${key}`,
    memCache: plCache,
    memKey:   key,
    force,
    fetch:    () => fetchAllPL(period),
  })
}

export async function getCachedAllBS(
  period: FinancialPeriod,
  force = false
): Promise<BalanceSheetStatement[]> {
  const key = periodKey(period)
  return readThrough({
    kvKey:    `fin:bs:all:${key}`,
    memCache: bsCache,
    memKey:   key,
    force,
    fetch:    () => fetchAllBS(period),
  })
}

export async function getCachedAllCF(
  period: FinancialPeriod,
  force = false
): Promise<CashFlowStatement[]> {
  const key = periodKey(period)
  return readThrough({
    kvKey:    `fin:cf:all:${key}`,
    memCache: cfCache,
    memKey:   key,
    force,
    fetch:    () => fetchAllCF(period),
  })
}

// ── Single-entity fetchers ────────────────────────────────────────────────────

export async function getCachedPL(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<PLStatement> {
  const key = orgPeriodKey(orgId, period)
  return readThrough({
    kvKey:    `fin:pl:${key}`,
    memCache: plSingleCache,
    memKey:   key,
    force,
    fetch:    () => fetchPLStatement(orgId, period),
  })
}

export async function getCachedBS(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<BalanceSheetStatement> {
  const key = orgPeriodKey(orgId, period)
  return readThrough({
    kvKey:    `fin:bs:${key}`,
    memCache: bsSingleCache,
    memKey:   key,
    force,
    fetch:    () => fetchBSStatement(orgId, period),
  })
}

export async function getCachedCF(
  orgId: string,
  period: FinancialPeriod,
  force = false
): Promise<CashFlowStatement> {
  const key = orgPeriodKey(orgId, period)
  return readThrough({
    kvKey:    `fin:cf:${key}`,
    memCache: cfSingleCache,
    memKey:   key,
    force,
    fetch:    () => fetchCFStatement(orgId, period),
  })
}

// ── Invalidation ──────────────────────────────────────────────────────────────

export function invalidateFinancialCache() {
  plCache.clear(); bsCache.clear(); cfCache.clear()
  plSingleCache.clear(); bsSingleCache.clear(); cfSingleCache.clear()
  // KV entries expire naturally via TTL; force=true on next fetch busts them
}
