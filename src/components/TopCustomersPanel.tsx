'use client'

import type { EntitySummary, TopCustomer } from '@/types'
import { fmtLocal, fmtPct } from '@/lib/format'

interface Props {
  entities: EntitySummary[]
}

export function TopCustomersPanel({ entities }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {entities
        .filter((e) => e.topCustomers.length > 0)
        .map((e) => (
          <div key={e.org.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">{e.org.short}</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{e.org.currency}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left font-medium text-gray-400">Customer</th>
                  <th className="pb-2 text-right font-medium text-gray-400">Billed</th>
                  <th className="pb-2 text-right font-medium text-gray-400">Outstanding</th>
                  <th className="pb-2 text-right font-medium text-gray-400">Inv.</th>
                </tr>
              </thead>
              <tbody>
                {e.topCustomers.map((c: TopCustomer) => {
                  const pct = c.total > 0 ? ((c.total - c.outstanding) / c.total) * 100 : 100
                  return (
                    <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-700 truncate max-w-[160px]" title={c.name}>
                        {c.name}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900 font-medium">
                        {fmtLocal(c.total, e.org.currency)}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${c.outstanding > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {c.outstanding > 0 ? fmtLocal(c.outstanding, e.org.currency) : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {c.invoiceCount}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}
