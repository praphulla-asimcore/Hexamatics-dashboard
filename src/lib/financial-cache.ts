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

import { pgGet as kvGet, pgSet as kvSet, pgGetStale as kvGetStale } from './pg-cache'
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

// 7 days — financial reports are warmed by the daily sync and stay served
// from PostgreSQL between syncs (matches the invoice DB freshness window).
const TTL_MS      = 7 * 24 * 60 * 60 * 1000  // in-memory L2
const TTL_SECONDS = 7 * 24 * 60 * 60          // PostgreSQL L1

// When a live fetch comes back broken and we fall back to stale data, we
// re-cache that stale data for a short window — otherwise every request
// during an active Zoho throttle would retry the live fetch and add more
// traffic to an account that's already being blocked, prolonging it.
const RETRY_BACKOFF_SECONDS = 15 * 60

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
  // When the live fetch "mostly failed" (e.g. Zoho rate-limited most/all
  // entities), prefer a last-known-good stale cache entry over showing
  // the broken result — this is what stops a Zoho throttle from turning
  // into a hard error on every page load once we have any good snapshot.
  isBroken?: (data: T) => boolean
}): Promise<T> {
  const { kvKey, memCache, memKey, force, fetch, isBroken } = opts
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
  const broken = isBroken?.(data) ?? false

  if (broken) {
    const stale = await kvGetStale<T>(kvKey)
    if (stale !== null && !isBroken!(stale)) {
      await kvSet(kvKey, stale, RETRY_BACKOFF_SECONDS)
      memCache.set(memKey, { data: stale, at: now })
      return stale
    }
  }

  // Broken with no usable stale fallback: still cache it, but only briefly —
  // otherwise a single rate-limited fetch would lock in a broken snapshot
  // for the full 7-day TTL instead of retrying once the throttle clears.
  await kvSet(kvKey, data, broken ? RETRY_BACKOFF_SECONDS : TTL_SECONDS)
  memCache.set(memKey, { data, at: now })
  return data
}

// A live fetch counts as "broken" when more than half the entities failed —
// that's the signature of an account-wide throttle, not a one-off org issue.
function majorityErrored(entities: { error?: string }[]): boolean {
  if (entities.length === 0) return false
  return entities.filter((e) => e.error).length > entities.length / 2
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
    isBroken: majorityErrored,
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
    isBroken: majorityErrored,
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
    isBroken: majorityErrored,
  })
}

// ── Single-entity fetchers ────────────────────────────────────────────────────

const hasError = (data: { error?: string }): boolean => !!data.error

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
    isBroken: hasError,
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
    isBroken: hasError,
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
    isBroken: hasError,
  })
}

// ── Invalidation ──────────────────────────────────────────────────────────────

export function invalidateFinancialCache() {
  plCache.clear(); bsCache.clear(); cfCache.clear()
  plSingleCache.clear(); bsSingleCache.clear(); cfSingleCache.clear()
  // KV entries expire naturally via TTL; force=true on next fetch busts them
}
