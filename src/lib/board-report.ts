/**
 * Board Report — pure computation helpers. No Zoho/DB imports, safe for the
 * client bundle.
 *
 * The report has two kinds of content:
 *  - Computed from live consolidated PL/BS data (revenue, margins, country
 *    breakdown, charts) — always accurate for whatever period is selected.
 *  - Judgment calls only a preparer can make (which items were one-off,
 *    what's still open in the consolidation, what the board should be told
 *    to do next) — entered through the editable panel, never guessed.
 */

import { COUNTRY_LABELS } from './interco'
import type { PLStatement } from '@/types/financials'
import type { OrgConfig } from '@/types'

export interface ExtraordinaryItem {
  id: string
  description: string
  /** Signed effect already included in reported profit: positive = gain, negative = loss/write-off. */
  effectMyr: number
  /** Entity this item is attributed to, for the country table's one-off/underlying columns. Omit for group-level items. */
  orgId?: string
  recognised: boolean
}

export interface OpenItem {
  id: string
  title: string
  description: string
}

export interface BoardReportMeta {
  preparedFor: string
  preparedBy: string
  keyTakeaways: string[]
  extraordinaryItems: ExtraordinaryItem[]
  openItems: OpenItem[]
  recommendedActions: string[]
}

export function emptyBoardReportMeta(): BoardReportMeta {
  return {
    preparedFor: '',
    preparedBy: '',
    keyTakeaways: [],
    extraordinaryItems: [],
    openItems: [],
    recommendedActions: [],
  }
}

/** underlying = reported − Σ(signed one-off effects already included in reported) */
export function computeUnderlying(reportedMyr: number, items: ExtraordinaryItem[]): number {
  const totalEffect = items.reduce((s, i) => s + i.effectMyr, 0)
  return reportedMyr - totalEffect
}

export function oneOffEffectForOrg(items: ExtraordinaryItem[], orgId: string): number {
  return items.filter((i) => i.orgId === orgId).reduce((s, i) => s + i.effectMyr, 0)
}

// ─── Country grouping ───────────────────────────────────────────────────────

export interface CountryRow {
  country: string
  countryLabel: string
  orgIds: string[]
  entityLabel: string // e.g. "HSSB, HCSSB, HexaHR"
  revenueMyr: number
  cogsMyr: number
  grossProfitMyr: number
  grossMarginPct: number
  opexMyr: number
  operatingProfitMyr: number
  ebtMyr: number
  taxMyr: number
  netProfitMyr: number
  oneOffMyr: number
  underlyingNetProfitMyr: number
  hasError: boolean
}

export function groupEntitiesByCountry(
  entities: PLStatement[],
  orgs: OrgConfig[],
  items: ExtraordinaryItem[]
): CountryRow[] {
  const orgMap = new Map(orgs.map((o) => [o.id, o]))
  const byCountry = new Map<string, PLStatement[]>()

  for (const e of entities) {
    const country = orgMap.get(e.orgId)?.country ?? 'Other'
    if (!byCountry.has(country)) byCountry.set(country, [])
    byCountry.get(country)!.push(e)
  }

  const rows: CountryRow[] = []
  for (const [country, ents] of byCountry) {
    const okEnts = ents.filter((e) => !e.error)
    const revenueMyr = okEnts.reduce((s, e) => s + e.data.totalRevenue * e.fxRate, 0)
    const cogsMyr = okEnts.reduce((s, e) => s + e.data.totalCogs * e.fxRate, 0)
    const grossProfitMyr = okEnts.reduce((s, e) => s + e.data.grossProfit * e.fxRate, 0)
    const opexMyr = okEnts.reduce((s, e) => s + e.data.totalOpex * e.fxRate, 0)
    const operatingProfitMyr = okEnts.reduce((s, e) => s + e.data.ebit * e.fxRate, 0)
    const ebtMyr = okEnts.reduce((s, e) => s + e.data.ebt * e.fxRate, 0)
    const taxMyr = okEnts.reduce((s, e) => s + e.data.totalTax * e.fxRate, 0)
    const netProfitMyr = okEnts.reduce((s, e) => s + e.data.netProfit * e.fxRate, 0)
    const oneOffMyr = ents.reduce((s, e) => s + oneOffEffectForOrg(items, e.orgId), 0)

    rows.push({
      country,
      countryLabel: COUNTRY_LABELS[country] ?? country,
      orgIds: ents.map((e) => e.orgId),
      entityLabel: ents.map((e) => e.orgShort).join(', '),
      revenueMyr,
      cogsMyr,
      grossProfitMyr,
      grossMarginPct: revenueMyr !== 0 ? (grossProfitMyr / revenueMyr) * 100 : 0,
      opexMyr,
      operatingProfitMyr,
      ebtMyr,
      taxMyr,
      netProfitMyr,
      oneOffMyr,
      underlyingNetProfitMyr: netProfitMyr - oneOffMyr,
      hasError: ents.some((e) => !!e.error),
    })
  }

  return rows.sort((a, b) => b.revenueMyr - a.revenueMyr)
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
