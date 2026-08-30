'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { ORGS } from '@/lib/orgs'
import { getFinancialPeriodLabel } from '@/lib/financial-period'
import {
  groupEntitiesByCountry, computeUnderlying, emptyBoardReportMeta, uid,
  type BoardReportMeta, type ExtraordinaryItem, type OpenItem,
} from '@/lib/board-report'
import type { FinancialPeriod, ConsolidatedPL, ConsolidatedBS } from '@/types/financials'

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const neg = n < 0
  const s = Math.round(Math.abs(n)).toLocaleString('en-MY')
  return neg ? `(${s})` : s
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function periodStorageKey(period: FinancialPeriod): string {
  return `board-report:${period.mode}_${period.year}_${period.month ?? ''}_${period.quarter ?? ''}_${period.half ?? ''}_${period.customFrom ?? ''}_${period.customTo ?? ''}`
}

// ─── Chart theme (light, matches the report's on-screen/print look) ────────

const CHART_OPTIONS: any = {
  indexAxis: 'y',
  responsive: true,
  animation: { duration: 400 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: 'rgba(139,24,232,0.18)',
      borderWidth: 1,
      titleColor: '#0f172a',
      bodyColor: '#374151',
      padding: 8,
      cornerRadius: 8,
    },
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(139,24,232,0.06)' } },
    y: { ticks: { color: '#374151', font: { size: 11 } }, grid: { display: false } },
  },
}

// ─── Editable meta panel ─────────────────────────────────────────────────────

function MetaEditor({ meta, onChange }: { meta: BoardReportMeta; onChange: (m: BoardReportMeta) => void }) {
  const [open, setOpen] = useState(true)

  const update = (patch: Partial<BoardReportMeta>) => onChange({ ...meta, ...patch })

  const addItem = (list: 'keyTakeaways' | 'recommendedActions') =>
    update({ [list]: [...meta[list], ''] } as any)
  const setItem = (list: 'keyTakeaways' | 'recommendedActions', i: number, v: string) => {
    const next = [...meta[list]]; next[i] = v
    update({ [list]: next } as any)
  }
  const removeItem = (list: 'keyTakeaways' | 'recommendedActions', i: number) =>
    update({ [list]: meta[list].filter((_, idx) => idx !== i) } as any)

  const addExtra = () => update({
    extraordinaryItems: [...meta.extraordinaryItems,
      { id: uid(), description: '', effectMyr: 0, recognised: true }],
  })
  const setExtra = (i: number, patch: Partial<ExtraordinaryItem>) => {
    const next = [...meta.extraordinaryItems]
    next[i] = { ...next[i], ...patch }
    update({ extraordinaryItems: next })
  }
  const removeExtra = (i: number) =>
    update({ extraordinaryItems: meta.extraordinaryItems.filter((_, idx) => idx !== i) })

  const addOpen = () => update({
    openItems: [...meta.openItems, { id: uid(), title: '', description: '' }],
  })
  const setOpenItem = (i: number, patch: Partial<OpenItem>) => {
    const next = [...meta.openItems]
    next[i] = { ...next[i], ...patch }
    update({ openItems: next })
  }
  const removeOpen = (i: number) =>
    update({ openItems: meta.openItems.filter((_, idx) => idx !== i) })

  const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-hexa-purple'

  return (
    <div className="print:hidden bg-white border border-gray-200 rounded-xl shadow-sm">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">
        <span>Report inputs — prepared for/by, one-off items, open items, actions</span>
        <span className="text-gray-400">{open ? '▾ collapse' : '▸ expand'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-600">
              Prepared for
              <input className={`${inputCls} mt-1`} value={meta.preparedFor}
                onChange={(e) => update({ preparedFor: e.target.value })} placeholder="e.g. Board of Directors" />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Prepared by
              <input className={`${inputCls} mt-1`} value={meta.preparedBy}
                onChange={(e) => update({ preparedBy: e.target.value })} placeholder="e.g. Finance Team" />
            </label>
          </div>

          {/* Key takeaways */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">What the board should take away</span>
              <button onClick={() => addItem('keyTakeaways')} className="text-xs text-hexa-purple font-medium hover:underline">+ add</button>
            </div>
            <div className="space-y-1.5">
              {meta.keyTakeaways.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={inputCls} value={t} onChange={(e) => setItem('keyTakeaways', i, e.target.value)}
                    placeholder="e.g. Underlying profit is RM X, not RM Y..." />
                  <button onClick={() => removeItem('keyTakeaways', i)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              ))}
              {meta.keyTakeaways.length === 0 && <p className="text-xs text-gray-400">None added — this section is omitted from the report.</p>}
            </div>
          </div>

          {/* Extraordinary items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Extraordinary / one-off items (reported vs underlying)</span>
              <button onClick={addExtra} className="text-xs text-hexa-purple font-medium hover:underline">+ add</button>
            </div>
            <div className="space-y-2">
              {meta.extraordinaryItems.map((item, i) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <input className={`${inputCls} flex-1`} value={item.description}
                    onChange={(e) => setExtra(i, { description: e.target.value })}
                    placeholder="Description, e.g. Gain on disposal of freehold building" />
                  <input className={`${inputCls} w-32`} type="number" value={item.effectMyr || ''}
                    onChange={(e) => setExtra(i, { effectMyr: parseFloat(e.target.value) || 0 })}
                    placeholder="Effect RM (+/-)" />
                  <select className={`${inputCls} w-40`} value={item.orgId ?? ''}
                    onChange={(e) => setExtra(i, { orgId: e.target.value || undefined })}>
                    <option value="">Group-level</option>
                    {ORGS.map((o) => <option key={o.id} value={o.id}>{o.short}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap">
                    <input type="checkbox" checked={item.recognised}
                      onChange={(e) => setExtra(i, { recognised: e.target.checked })} />
                    recognised
                  </label>
                  <button onClick={() => removeExtra(i)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              ))}
              {meta.extraordinaryItems.length === 0 && (
                <p className="text-xs text-gray-400">None added — reported profit is shown as-is, with no underlying/waterfall breakout.</p>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Effect is signed as it appears in reported profit: a gain (e.g. disposal gain) is positive; a loss/write-off is negative.</p>
          </div>

          {/* Open items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Open items affecting these figures</span>
              <button onClick={addOpen} className="text-xs text-hexa-purple font-medium hover:underline">+ add</button>
            </div>
            <div className="space-y-2">
              {meta.openItems.map((item, i) => (
                <div key={item.id} className="flex items-start gap-1.5">
                  <input className={`${inputCls} w-40`} value={item.title}
                    onChange={(e) => setOpenItem(i, { title: e.target.value })} placeholder="Title" />
                  <textarea className={`${inputCls} flex-1`} rows={1} value={item.description}
                    onChange={(e) => setOpenItem(i, { description: e.target.value })} placeholder="Description" />
                  <button onClick={() => removeOpen(i)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              ))}
              {meta.openItems.length === 0 && <p className="text-xs text-gray-400">None added.</p>}
            </div>
          </div>

          {/* Recommended actions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Recommended actions</span>
              <button onClick={() => addItem('recommendedActions')} className="text-xs text-hexa-purple font-medium hover:underline">+ add</button>
            </div>
            <div className="space-y-1.5">
              {meta.recommendedActions.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={inputCls} value={t} onChange={(e) => setItem('recommendedActions', i, e.target.value)} />
                  <button onClick={() => removeItem('recommendedActions', i)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              ))}
              {meta.recommendedActions.length === 0 && <p className="text-xs text-gray-400">None added.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────

export function BoardReportView({ period }: { period: FinancialPeriod }) {
  const [pl, setPL] = useState<ConsolidatedPL | null>(null)
  const [bs, setBS] = useState<ConsolidatedBS | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<BoardReportMeta>(emptyBoardReportMeta())

  const storageKey = periodStorageKey(period)

  // Load/reset editable inputs per period
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setMeta(saved ? JSON.parse(saved) : emptyBoardReportMeta())
    } catch {
      setMeta(emptyBoardReportMeta())
    }
  }, [storageKey])

  const updateMeta = useCallback((m: BoardReportMeta) => {
    setMeta(m)
    try { localStorage.setItem(storageKey, JSON.stringify(m)) } catch { /* ignore */ }
  }, [storageKey])

  // Fetch both PL and BS for this period — independent of the PL/BS/CF tab
  // fetch above, which wipes the other tabs' data on every switch.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ mode: period.mode, year: String(period.year), comparison: period.comparison })
    if (period.month) params.set('month', String(period.month))
    if (period.quarter) params.set('quarter', String(period.quarter))
    if (period.half) params.set('half', String(period.half))
    if (period.customFrom) params.set('customFrom', period.customFrom)
    if (period.customTo) params.set('customTo', period.customTo)

    Promise.all([
      fetch(`/api/financials/pl?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error('Failed to load P&L'); return r.json() }),
      fetch(`/api/financials/bs?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error('Failed to load balance sheet'); return r.json() }),
    ])
      .then(([plJson, bsJson]) => {
        if (controller.signal.aborted) return
        setPL(plJson.consolidated)
        setBS(bsJson.consolidated)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => controller.abort()
  }, [period.mode, period.year, period.month, period.quarter, period.half, period.customFrom, period.customTo, period.comparison])

  const periodLabel = getFinancialPeriodLabel(period)

  const countryRows = useMemo(
    () => (pl ? groupEntitiesByCountry(pl.entities, ORGS, meta.extraordinaryItems) : []),
    [pl, meta.extraordinaryItems]
  )

  const reportedProfit = pl?.group.netProfitMyr ?? 0
  const underlyingProfit = computeUnderlying(reportedProfit, meta.extraordinaryItems)
  const totalOneOff = reportedProfit - underlyingProfit
  const activeEntities = pl?.entities.filter((e) => !e.error) ?? []
  const errored = pl?.entities.filter((e) => e.error) ?? []

  const revenueChart = {
    labels: countryRows.map((r) => r.countryLabel),
    datasets: [{ data: countryRows.map((r) => r.revenueMyr), backgroundColor: '#8B18E8AA', borderColor: '#8B18E8', borderWidth: 1, borderRadius: 4 }],
  }
  const marginChart = {
    labels: [...countryRows].sort((a, b) => b.grossMarginPct - a.grossMarginPct).map((r) => r.countryLabel),
    datasets: [{ data: [...countryRows].sort((a, b) => b.grossMarginPct - a.grossMarginPct).map((r) => r.grossMarginPct), backgroundColor: '#1B1BE8AA', borderColor: '#1B1BE8', borderWidth: 1, borderRadius: 4 }],
  }
  const netProfitChart = {
    labels: [...countryRows].sort((a, b) => b.netProfitMyr - a.netProfitMyr).map((r) => r.countryLabel),
    datasets: [{
      data: [...countryRows].sort((a, b) => b.netProfitMyr - a.netProfitMyr).map((r) => r.netProfitMyr),
      backgroundColor: [...countryRows].sort((a, b) => b.netProfitMyr - a.netProfitMyr).map((r) => (r.netProfitMyr >= 0 ? '#059669AA' : '#dc2626AA')),
      borderColor: [...countryRows].sort((a, b) => b.netProfitMyr - a.netProfitMyr).map((r) => (r.netProfitMyr >= 0 ? '#059669' : '#dc2626')),
      borderWidth: 1, borderRadius: 4,
    }],
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm font-medium">Building board report for {periodLabel}…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-400 text-sm">{error}</div>
  }

  if (!pl || !bs) return null

  return (
    <div className="space-y-5">
      <MetaEditor meta={meta} onChange={updateMeta} />

      <div id="board-report-print" className="bg-white text-gray-900 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        {/* Cover */}
        <div className="board-cover bg-hexa-gradient text-white p-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-3 h-3 rounded-full bg-white" />
            <span className="text-xs font-bold tracking-widest uppercase">Hexamatics Group</span>
          </div>
          <p className="text-xs font-semibold tracking-widest uppercase opacity-80 mb-2">Board Report</p>
          <h1 className="text-3xl font-bold mb-1">Group Financial Report</h1>
          <p className="text-sm opacity-85 mb-8">{periodLabel}</p>
          <div className="grid grid-cols-4 gap-6 mb-10 max-w-2xl">
            <div>
              <p className="text-2xl font-bold tabular-nums">{fmt(pl.group.totalRevenueMyr)}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-75">Revenue (RM)</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{fmt(pl.group.grossProfitMyr)}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-75">Gross Profit (RM)</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{fmt(reportedProfit)}</p>
              <p className="text-[10px] uppercase tracking-wider opacity-75">Profit for the Period (RM)</p>
            </div>
            {meta.extraordinaryItems.length > 0 && (
              <div>
                <p className="text-2xl font-bold tabular-nums">{fmt(underlyingProfit)}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-75">Underlying Profit (RM)</p>
              </div>
            )}
          </div>
          <div className="flex gap-10 text-xs opacity-85">
            <div><p className="uppercase tracking-wider opacity-70 mb-0.5">Prepared for</p><p className="font-medium">{meta.preparedFor || '—'}</p></div>
            <div><p className="uppercase tracking-wider opacity-70 mb-0.5">Prepared by</p><p className="font-medium">{meta.preparedBy || '—'}</p></div>
            <div><p className="uppercase tracking-wider opacity-70 mb-0.5">Reporting currency</p><p className="font-medium">Malaysian Ringgit (RM)</p></div>
            <div><p className="uppercase tracking-wider opacity-70 mb-0.5">Basis</p><p className="font-medium">Management consolidation, unaudited</p></div>
          </div>
        </div>

        {errored.length > 0 && (
          <div className="mx-8 mt-6 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold mb-1">Some entities could not be loaded and are excluded from this report:</p>
            {errored.map((e) => <p key={e.orgId}>· {e.orgShort}</p>)}
          </div>
        )}

        {/* Executive summary */}
        <section className="board-section p-8 border-t border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Executive Summary</h2>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              ['Revenue', pl.group.totalRevenueMyr],
              ['Gross Profit', pl.group.grossProfitMyr],
              ['Operating Profit', pl.group.ebitMyr],
              ['Profit for Period', reportedProfit],
              ...(meta.extraordinaryItems.length > 0 ? [['Underlying Profit', underlyingProfit]] as [string, number][] : []),
              ['Total Assets', bs.group.totalAssetsMyr],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border border-gray-200 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
                <p className="text-base font-bold tabular-nums text-gray-900">{fmt(val as number)}</p>
              </div>
            ))}
          </div>

          {meta.extraordinaryItems.length > 0 && (
            <div className="mb-6 rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Reported to Underlying</p>
              <div className="flex items-end gap-6 text-sm">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{fmt(reportedProfit)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Profit for<br />the period</p>
                </div>
                <span className="text-gray-300 pb-4">→</span>
                <div className="text-center">
                  <p className={`text-lg font-bold tabular-nums ${totalOneOff >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {totalOneOff >= 0 ? `(${fmt(totalOneOff)})` : `+${fmt(-totalOneOff)}`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">One-off items<br />({meta.extraordinaryItems.length})</p>
                </div>
                <span className="text-gray-300 pb-4">→</span>
                <div className="text-center">
                  <p className="text-lg font-bold text-hexa-purple tabular-nums">{fmt(underlyingProfit)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Underlying<br />profit</p>
                </div>
              </div>
              {reportedProfit !== 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  RM {fmt(Math.abs(totalOneOff))} of the reported result — {fmtPct(Math.abs(totalOneOff / reportedProfit) * 100)} — comes from non-recurring items.
                </p>
              )}
            </div>
          )}

          {meta.keyTakeaways.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">What the Board Should Take Away</p>
              <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
                {meta.keyTakeaways.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Country Snapshot</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 pr-3 font-medium">Market</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Revenue</th>
                    <th className="py-1.5 pr-3 font-medium text-right">% Grp</th>
                    <th className="py-1.5 pr-3 font-medium text-right">GP %</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Net Profit</th>
                    {meta.extraordinaryItems.length > 0 && <th className="py-1.5 font-medium text-right">Underlying</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {countryRows.map((r) => (
                    <tr key={r.country}>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-gray-900">{r.countryLabel}</span>
                        <span className="block text-[10px] text-gray-400">{r.entityLabel}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.revenueMyr)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(pl.group.totalRevenueMyr ? (r.revenueMyr / pl.group.totalRevenueMyr) * 100 : 0)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(r.grossMarginPct)}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${r.netProfitMyr < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(r.netProfitMyr)}</td>
                      {meta.extraordinaryItems.length > 0 && (
                        <td className={`py-1.5 text-right tabular-nums ${r.underlyingNetProfitMyr < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(r.underlyingNetProfitMyr)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Group P&L */}
        <section className="board-section p-8 border-t border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Group Statement of Profit or Loss</h2>
          <table className="w-full text-sm max-w-xl">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200 text-xs">
                <th className="py-1.5 font-medium">RM</th>
                <th className="py-1.5 font-medium text-right">{periodLabel}</th>
                <th className="py-1.5 font-medium text-right">% Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['Revenue', pl.group.totalRevenueMyr, false],
                ['Cost of sales', -pl.group.totalCogsMyr, false],
                ['Gross profit', pl.group.grossProfitMyr, true],
                ['Operating expenses', -pl.group.totalOpexMyr, false],
                ['Operating profit', pl.group.ebitMyr, true],
                ['Profit for the period', reportedProfit, true],
              ].map(([label, val, bold], i) => (
                <tr key={i} className={bold ? 'font-semibold' : ''}>
                  <td className="py-1.5">{label as string}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(val as number)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">
                    {pl.group.totalRevenueMyr ? fmtPct((val as number) / pl.group.totalRevenueMyr * 100) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Balance sheet */}
        <section className="board-section p-8 border-t border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Group Statement of Financial Position</h2>
          <div className="grid grid-cols-3 gap-4 max-w-2xl text-sm">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total Assets</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{fmt(bs.group.totalAssetsMyr)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total Liabilities</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{fmt(bs.group.totalLiabilitiesMyr)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total Equity</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{fmt(bs.group.totalEquityMyr)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Current Ratio</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{bs.group.currentRatio.toFixed(2)}x</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Gearing (D/E)</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{bs.group.debtToEquity.toFixed(2)}x</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Working Capital</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{fmt(bs.group.workingCapitalMyr)}</p>
            </div>
          </div>
        </section>

        {/* Extraordinary items */}
        {meta.extraordinaryItems.length > 0 && (
          <section className="board-section p-8 border-t border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Extraordinary Items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 text-xs">
                  <th className="py-1.5 pr-3 font-medium">Event</th>
                  <th className="py-1.5 pr-3 font-medium">Entity</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Effect on Group Profit (RM)</th>
                  <th className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {meta.extraordinaryItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1.5 pr-3">{item.description || '—'}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{ORGS.find((o) => o.id === item.orgId)?.short ?? 'Group'}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${item.effectMyr >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.effectMyr >= 0 ? fmt(item.effectMyr) : `(${fmt(-item.effectMyr)})`}
                    </td>
                    <td className="py-1.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${item.recognised ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {item.recognised ? 'Recognised' : 'Not yet recognised'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-hexa-purple">
                  <td className="py-1.5" colSpan={2}>Net effect on reported profit</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(totalOneOff)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Country P&L */}
        <section className="board-section p-8 border-t border-gray-100 chart-grid">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Country Profit and Loss</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3 font-medium">Market</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Revenue</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Gross Profit</th>
                  <th className="py-1.5 pr-3 font-medium text-right">GP %</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Op. Expenses</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Op. Profit</th>
                  <th className="py-1.5 pr-3 font-medium text-right">PBT</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Tax</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Net Profit</th>
                  {meta.extraordinaryItems.length > 0 && (
                    <>
                      <th className="py-1.5 pr-3 font-medium text-right">One-off</th>
                      <th className="py-1.5 font-medium text-right">Underlying</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {countryRows.map((r) => (
                  <tr key={r.country} className="font-medium">
                    <td className="py-1.5 pr-3 text-gray-900">{r.countryLabel}<span className="block text-[10px] font-normal text-gray-400">{r.entityLabel}</span></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.revenueMyr)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.grossProfitMyr)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(r.grossMarginPct)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.opexMyr)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.operatingProfitMyr)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.ebtMyr)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.taxMyr)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${r.netProfitMyr < 0 ? 'text-red-600' : ''}`}>{fmt(r.netProfitMyr)}</td>
                    {meta.extraordinaryItems.length > 0 && (
                      <>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{r.oneOffMyr !== 0 ? fmt(r.oneOffMyr) : '—'}</td>
                        <td className={`py-1.5 text-right tabular-nums ${r.underlyingNetProfitMyr < 0 ? 'text-red-600' : ''}`}>{fmt(r.underlyingNetProfitMyr)}</td>
                      </>
                    )}
                  </tr>
                ))}
                <tr className="font-bold border-t-2 border-hexa-purple">
                  <td className="py-1.5 pr-3">Group</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(pl.group.totalRevenueMyr)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(pl.group.grossProfitMyr)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(pl.group.grossMarginPct)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(pl.group.totalOpexMyr)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(pl.group.ebitMyr)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">—</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">—</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(reportedProfit)}</td>
                  {meta.extraordinaryItems.length > 0 && (
                    <>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(totalOneOff)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(underlyingProfit)}</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-bold text-gray-900 mb-3">Performance Visualisation</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Revenue by Country (RM)</p>
              <Bar data={revenueChart} options={CHART_OPTIONS} height={countryRows.length * 32 + 20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Gross Margin by Country</p>
              <Bar data={marginChart} options={CHART_OPTIONS} height={countryRows.length * 32 + 20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Net Profit by Country (RM)</p>
              <Bar data={netProfitChart} options={CHART_OPTIONS} height={countryRows.length * 32 + 20} />
            </div>
          </div>
        </section>

        {/* Open items + recommended actions */}
        {(meta.openItems.length > 0 || meta.recommendedActions.length > 0) && (
          <section className="board-section p-8 border-t border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Basis of Preparation and Open Items</h2>

            {meta.openItems.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Open items affecting these figures</p>
                <div className="space-y-2">
                  {meta.openItems.map((item, i) => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <span className="font-semibold text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
                      <div>
                        <span className="font-semibold text-gray-900">{item.title}</span>
                        {item.description && <span className="text-gray-600"> — {item.description}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Basis of preparation</p>
                <p className="text-sm text-gray-600">
                  Figures cover {periodLabel} and are drawn from the group consolidation. They are management
                  information and have not been audited. Presentation currency is the Malaysian Ringgit.
                  Foreign operations are translated at closing rates for the balance sheet and average rates
                  for the income statement.
                  {meta.extraordinaryItems.length > 0 && ' "Underlying" removes the one-off items listed above; it carries no tax adjustment unless stated.'}
                </p>
              </div>
              {meta.recommendedActions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Recommended actions</p>
                  <ol className="space-y-1 text-sm text-gray-700 list-decimal list-inside">
                    {meta.recommendedActions.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
                  </ol>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
          <span>Hexamatics Group — Board Report</span>
          <span>Management information · Unaudited · Generated {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}
