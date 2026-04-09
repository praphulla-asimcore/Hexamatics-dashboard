'use client'

import { useState } from 'react'
import type { EntitySummary } from '@/types'
import { fmtLocal, fmtMyr, fmtPct, collectionColor } from '@/lib/format'

interface Props {
  entities: EntitySummary[]
}

type SortKey = 'name' | 'jan' | 'feb' | 'ytd' | 'outstanding' | 'collPct'

export function EntityTable({ entities }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('ytd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const setDir = setSortDir

  const getValue = (e: EntitySummary, key: SortKey): number | string => {
    switch (key) {
      case 'name': return e.org.name
      case 'jan': return e.jan.totalMyr
      case 'feb': return e.feb.totalMyr
      case 'ytd': return e.ytd.totalMyr
      case 'outstanding': return e.ytd.outstanding * e.org.fxToMyr
      case 'collPct': return e.ytd.total > 0 ? e.ytd.collected / e.ytd.total : 0
      default: return 0
    }
  }

  const sorted = [...entities].sort((a, b) => {
    const av = getValue(a, sortKey)
    const bv = getValue(b, sortKey)
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap"
    >
      {label} {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const badgeClass = (pct: number) =>
    pct >= 90
      ? 'bg-green-50 text-green-700'
      : pct >= 60
      ? 'bg-amber-50 text-amber-700'
      : pct > 0
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-50 text-gray-400'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th
              onClick={() => toggleSort('name')}
              className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-900"
            >
              Entity {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Curr</th>
            <SortTh col="jan" label="Jan (local)" />
            <SortTh col="feb" label="Feb (local)" />
            <SortTh col="ytd" label="YTD (MYR)" />
            <SortTh col="outstanding" label="Outstanding" />
            <SortTh col="collPct" label="Collection %" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const pct = e.ytd.total > 0 ? (e.ytd.collected / e.ytd.total) * 100 : 0
            const outMyr = e.ytd.outstanding * e.org.fxToMyr
            return (
              <tr key={e.org.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 font-medium text-gray-900">{e.org.short}</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">{e.org.currency}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                  {e.jan.total > 0 ? fmtLocal(e.jan.total, e.org.currency) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                  {e.feb.total > 0 ? fmtLocal(e.feb.total, e.org.currency) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900">
                  {e.ytd.totalMyr > 0 ? fmtMyr(e.ytd.totalMyr) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${outMyr > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  {outMyr > 0 ? fmtMyr(outMyr) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {e.ytd.total > 0 ? (
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${badgeClass(pct)}`}>
                      {fmtPct(pct)}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-gray-700">Group Total</td>
            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900">
              {fmtMyr(entities.reduce((s, e) => s + e.ytd.totalMyr, 0))}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-600">
              {fmtMyr(entities.reduce((s, e) => s + e.ytd.outstanding * e.org.fxToMyr, 0))}
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-xs font-semibold text-green-700">
                {fmtPct(
                  (() => {
                    const ytd = entities.reduce((s, e) => s + e.ytd.totalMyr, 0)
                    const out = entities.reduce((s, e) => s + e.ytd.outstanding * e.org.fxToMyr, 0)
                    return ytd > 0 ? ((ytd - out) / ytd) * 100 : 0
                  })()
                )}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
