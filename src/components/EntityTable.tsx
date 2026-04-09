'use client'

import { useState } from 'react'
import type { EntitySummary } from '@/types'
import { fmtLocal, fmtMyr, fmtPct, fmtChange, collectionColor } from '@/lib/format'

interface Props {
  entities: EntitySummary[]
  periodLabel: string
  comparisonLabel: string
}

type SortKey = 'name' | 'period' | 'comparison' | 'growth' | 'outstanding' | 'collPct'

export function EntityTable({ entities, periodLabel, comparisonLabel }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('period')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const getValue = (e: EntitySummary, key: SortKey): number | string => {
    const prev = e.comparison?.totalMyr ?? 0
    const curr = e.period.totalMyr
    switch (key) {
      case 'name': return e.org.name
      case 'period': return curr
      case 'comparison': return prev
      case 'growth': return prev > 0 ? ((curr - prev) / prev) * 100 : 0
      case 'outstanding': return e.period.outstanding * e.org.fxToMyr
      case 'collPct': return e.period.total > 0 ? e.period.collected / e.period.total : 0
      default: return 0
    }
  }

  const sorted = [...entities].sort((a, b) => {
    const av = getValue(a, sortKey), bv = getValue(b, sortKey)
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const Th = ({ col, label, right = true }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-3 py-2.5 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-300 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
    >
      {label} {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const hasComparison = entities.some((e) => e.comparison?.total ?? 0 > 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-800">
            <Th col="name" label="Entity" right={false} />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Curr</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Local Revenue</th>
            <Th col="period" label={`MYR (${periodLabel})`} />
            {hasComparison && <Th col="comparison" label={`MYR (${comparisonLabel})`} />}
            {hasComparison && <Th col="growth" label="Growth" />}
            <Th col="outstanding" label="Outstanding (MYR)" />
            <Th col="collPct" label="Collection %" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const pct = e.period.total > 0 ? (e.period.collected / e.period.total) * 100 : 0
            const outMyr = e.period.outstanding * e.org.fxToMyr
            const prev = e.comparison?.totalMyr ?? 0
            const curr = e.period.totalMyr
            const growth = prev > 0 ? ((curr - prev) / prev) * 100 : null

            return (
              <tr key={e.org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition">
                <td className="px-3 py-2.5 font-medium text-white">{e.org.short}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{e.org.currency}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-400 text-xs">
                  {e.period.total > 0 ? fmtLocal(e.period.total, e.org.currency) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-white">
                  {curr > 0 ? fmtMyr(curr) : <span className="text-gray-700">—</span>}
                </td>
                {hasComparison && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                    {prev > 0 ? fmtMyr(prev) : <span className="text-gray-700">—</span>}
                  </td>
                )}
                {hasComparison && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium">
                    {growth !== null ? (
                      <span className={growth >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {fmtChange(growth)}
                      </span>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                )}
                <td className={`px-3 py-2.5 text-right tabular-nums ${outMyr > 0 ? 'text-amber-400' : 'text-gray-700'}`}>
                  {outMyr > 0 ? fmtMyr(outMyr) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {e.period.total > 0 ? (
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                      pct >= 90 ? 'bg-emerald-900/40 text-emerald-400' :
                      pct >= 70 ? 'bg-amber-900/40 text-amber-400' :
                      'bg-red-900/40 text-red-400'
                    }`}>
                      {fmtPct(pct)}
                    </span>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-700 bg-gray-800/30">
            <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-400">Group Total</td>
            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-white">
              {fmtMyr(entities.reduce((s, e) => s + e.period.totalMyr, 0))}
            </td>
            {hasComparison && (
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-500">
                {fmtMyr(entities.reduce((s, e) => s + (e.comparison?.totalMyr ?? 0), 0))}
              </td>
            )}
            {hasComparison && (
              <td className="px-3 py-2.5 text-right">
                {(() => {
                  const curr = entities.reduce((s, e) => s + e.period.totalMyr, 0)
                  const prev = entities.reduce((s, e) => s + (e.comparison?.totalMyr ?? 0), 0)
                  const g = prev > 0 ? ((curr - prev) / prev) * 100 : null
                  return g !== null ? (
                    <span className={`text-xs font-bold ${g >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtChange(g)}
                    </span>
                  ) : null
                })()}
              </td>
            )}
            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-400">
              {fmtMyr(entities.reduce((s, e) => s + e.period.outstanding * e.org.fxToMyr, 0))}
            </td>
            <td className="px-3 py-2.5 text-right">
              {(() => {
                const total = entities.reduce((s, e) => s + e.period.totalMyr, 0)
                const out = entities.reduce((s, e) => s + e.period.outstanding * e.org.fxToMyr, 0)
                const pct = total > 0 ? ((total - out) / total) * 100 : 0
                return (
                  <span className={`text-xs font-bold ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {fmtPct(pct)}
                  </span>
                )
              })()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
