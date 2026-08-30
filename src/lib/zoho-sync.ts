/**
 * Zoho → PostgreSQL invoice sync.
 *
 * Fetches invoices from Zoho Books and upserts them into synced_invoices.
 * Once synced, the dashboard reads from PostgreSQL — zero Zoho API calls
 * during page loads, no rate-limit waits, instant responses.
 *
 * Sync modes:
 *   full        — fetches from 2023-01-01 to today (all history, slow once)
 *   incremental — fetches last 90 days (catches new invoices + balance
 *                 changes on existing ones; fast, run every 15 min)
 */

import { getPool } from './pg'
import { ORGS } from './orgs'
import { zohoFetch } from './zoho-auth'
import { getCustomerType } from './customer-classification'
import type { ZohoInvoice, OrgConfig } from '@/types'

export type SyncMode = 'full' | 'incremental'

// ── Schema bootstrap ──────────────────────────────────────────────────────────
// synced_invoices/sync_state had no creation DDL anywhere in the repo — they
// only existed because someone ran a one-off SQL script against the current
// database. A fresh/disposable database would have runSync() fail outright.
// Idempotent + cached per Lambda instance, mirroring pg-cache.ts's pattern.
let syncTablesReady = false

async function ensureSyncTables(): Promise<void> {
  if (syncTablesReady) return
  const pool = getPool()
  if (!pool) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS synced_invoices (
      invoice_id    TEXT        NOT NULL,
      org_id        TEXT        NOT NULL,
      customer_name TEXT        NOT NULL,
      customer_type TEXT        NOT NULL,
      date          DATE        NOT NULL,
      due_date      DATE,
      status        TEXT        NOT NULL,
      total         NUMERIC     NOT NULL,
      balance       NUMERIC     NOT NULL,
      currency      TEXT        NOT NULL,
      synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (org_id, invoice_id)
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_synced_invoices_date ON synced_invoices (date)
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      org_id        TEXT        PRIMARY KEY,
      org_name      TEXT        NOT NULL,
      last_synced   TIMESTAMPTZ,
      invoice_count INTEGER,
      status        TEXT        NOT NULL,
      error         TEXT
    )
  `)

  syncTablesReady = true
}

interface SyncResult {
  orgId:   string
  orgName: string
  count:   number
  status:  'ok' | 'error'
  error?:  string
  ms:      number
}

// ── Fetch invoices from Zoho for one org ─────────────────────────────────────

async function fetchInvoices(
  orgId: string,
  from: string,
  to: string
): Promise<ZohoInvoice[]> {
  const all: ZohoInvoice[] = []
  let page = 1
  while (true) {
    const data: any = await zohoFetch('/invoices', {
      organization_id: orgId,
      sort_column:     'date',
      sort_order:      'D',
      per_page:        '200',
      page:            String(page),
      filter_by:       'Status.All',
      date_start:      from,
      date_end:        to,
    })
    const rows: ZohoInvoice[] = data.invoices ?? []
    all.push(...rows)
    if (!data.page_context?.has_more_page || page >= 30) break
    page++
  }
  return all
}

// ── Bulk upsert via UNNEST arrays ─────────────────────────────────────────────

async function upsertInvoices(orgId: string, invoices: ZohoInvoice[]): Promise<void> {
  const pool = getPool()
  if (!pool || invoices.length === 0) return

  // Build typed arrays for UNNEST
  const ids:       string[]  = []
  const orgIds:    string[]  = []
  const names:     string[]  = []
  const types:     string[]  = []
  const dates:     string[]  = []
  const dueDates:  (string | null)[] = []
  const statuses:  string[]  = []
  const totals:    number[]  = []
  const balances:  number[]  = []
  const currencies:string[]  = []

  for (const inv of invoices) {
    ids.push(inv.invoice_id)
    orgIds.push(orgId)
    names.push(inv.customer_name)
    types.push(getCustomerType(inv.customer_name))
    dates.push(inv.date)
    dueDates.push(inv.due_date || null)
    statuses.push(inv.status)
    totals.push(inv.total)
    balances.push(inv.balance)
    currencies.push(inv.currency_code)
  }

  await pool.query(
    `INSERT INTO synced_invoices
       (invoice_id, org_id, customer_name, customer_type,
        date, due_date, status, total, balance, currency)
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[],
       $5::date[], $6::date[], $7::text[],
       $8::numeric[], $9::numeric[], $10::text[]
     ) AS t(invoice_id, org_id, customer_name, customer_type,
            date, due_date, status, total, balance, currency)
     ON CONFLICT (org_id, invoice_id) DO UPDATE
       SET customer_name = EXCLUDED.customer_name,
           customer_type = EXCLUDED.customer_type,
           status        = EXCLUDED.status,
           balance       = EXCLUDED.balance,
           synced_at     = NOW()`,
    [ids, orgIds, names, types, dates, dueDates, statuses, totals, balances, currencies]
  )
}

// ── Sync one org ──────────────────────────────────────────────────────────────

async function syncOrg(org: OrgConfig, from: string, to: string): Promise<SyncResult> {
  const pool = getPool()
  const t0 = Date.now()

  try {
    const invoices = await fetchInvoices(org.id, from, to)
    await upsertInvoices(org.id, invoices)

    if (pool) {
      await pool.query(
        `INSERT INTO sync_state (org_id, org_name, last_synced, invoice_count, status, error)
         VALUES ($1,$2,NOW(),$3,'ok',NULL)
         ON CONFLICT (org_id) DO UPDATE
           SET org_name = EXCLUDED.org_name,
               last_synced = NOW(),
               invoice_count = EXCLUDED.invoice_count,
               status = 'ok',
               error = NULL`,
        [org.id, org.name, invoices.length]
      )
    }

    return { orgId: org.id, orgName: org.name, count: invoices.length, status: 'ok', ms: Date.now() - t0 }
  } catch (err: any) {
    if (pool) {
      await pool.query(
        `INSERT INTO sync_state (org_id, org_name, status, error)
         VALUES ($1,$2,'error',$3)
         ON CONFLICT (org_id) DO UPDATE
           SET status = 'error', error = EXCLUDED.error`,
        [org.id, org.name, err.message]
      ).catch(() => {})
    }
    return { orgId: org.id, orgName: org.name, count: 0, status: 'error', error: err.message, ms: Date.now() - t0 }
  }
}

// ── Main sync entry point ─────────────────────────────────────────────────────

export async function runSync(mode: SyncMode = 'incremental'): Promise<SyncResult[]> {
  await ensureSyncTables()

  const now  = new Date()
  const to   = now.toISOString().slice(0, 10)
  const from = mode === 'full'
    ? '2023-01-01'
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Sync orgs sequentially — respects Zoho rate limiter within single Lambda
  const results: SyncResult[] = []
  for (const org of ORGS) {
    results.push(await syncOrg(org, from, to))
  }
  return results
}

// ── Read sync state ───────────────────────────────────────────────────────────

export async function getSyncStatus(): Promise<{
  orgs: { orgId: string; orgName: string; lastSynced: string | null; invoiceCount: number; status: string; error: string | null }[]
  oldestSync: string | null
  isReady: boolean
}> {
  const pool = getPool()
  if (!pool) return { orgs: [], oldestSync: null, isReady: false }

  try {
    const res = await pool.query<{
      org_id: string; org_name: string; last_synced: string | null
      invoice_count: number; status: string; error: string | null
    }>(
      `SELECT org_id, org_name, last_synced, invoice_count, status, error
       FROM sync_state ORDER BY org_name`
    )
    const orgs = res.rows.map((r) => ({
      orgId:        r.org_id,
      orgName:      r.org_name,
      lastSynced:   r.last_synced,
      invoiceCount: r.invoice_count,
      status:       r.status,
      error:        r.error,
    }))
    const synced   = orgs.filter((o) => o.status === 'ok' && o.lastSynced)
    const oldest   = synced.length ? synced.reduce((a, b) => (a.lastSynced! < b.lastSynced! ? a : b)).lastSynced : null
    const isReady  = synced.length === ORGS.length

    return { orgs, oldestSync: oldest, isReady }
  } catch {
    return { orgs: [], oldestSync: null, isReady: false }
  }
}
