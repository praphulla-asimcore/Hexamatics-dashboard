'use client'

import type { EntitySummary } from '@/types'
import { fmtLocal, fmtMyr, fmtPct, collectionColor, collectionBg } from '@/lib/format'
import { differenceInDays } from 'date-fns'

interface Props {
  entities: EntitySummary[]
}

function AgingRow({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums font-medium ${color}`}>{value.toLocaleString()}</span>
    </div>
  )
}

export function CollectionsPanel({ entities }: Props) {
  const withOutstanding = entities.filter((e) => e.ytd.outstanding > 0)
  const noOutstanding = entities.filter((e) => e.ytd.total > 0 && e.ytd.outstanding === 0)

  return (
    <div className="space-y-6">
      {/* Summary flags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {withOutstanding.map((e) => {
          const pct = e.ytd.total > 0 ? (e.ytd.collected / e.ytd.total) * 100 : 0
          const aging = e.arAging
          const outMyr = e.ytd.outstanding * e.org.fxToMyr
          const riskLevel = pct < 60 ? 'high' : pct < 90 ? 'medium' : 'low'

          return (
            <div
              key={e.org.id}
              className={`bg-white rounded-xl border p-4 ${
                riskLevel === 'high'
                  ? 'border-red-200'
                  : riskLevel === 'medium'
                  ? 'border-amber-200'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{e.org.short}</p>
                  <p className="text-xs text-gray-400">{e.org.currency} · {e.org.country}</p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    riskLevel === 'high'
                      ? 'bg-red-50 text-red-700'
                      : riskLevel === 'medium'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  {fmtPct(pct)}
                </span>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Outstanding</span>
                  <span className="tabular-nums font-medium text-gray-900">
                    {fmtLocal(e.ytd.outstanding, e.org.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>MYR equivalent</span>
                  <span className="tabular-nums">{fmtMyr(outMyr)}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${collectionBg(pct)}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Aging breakdown */}
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs font-medium text-gray-500 mb-1.5">AR aging (local currency)</p>
                <AgingRow label="Not yet due" value={Math.round(aging.current)} color="text-green-600" />
                <AgingRow label="1–30 days overdue" value={Math.round(aging.days1to30)} color="text-yellow-600" />
                <AgingRow label="31–60 days overdue" value={Math.round(aging.days31to60)} color="text-orange-600" />
                <AgingRow label="61–90 days overdue" value={Math.round(aging.days61to90)} color="text-red-500" />
                <AgingRow label="90+ days overdue" value={Math.round(aging.days90plus)} color="text-red-700" />
                {aging.current === 0 && aging.days1to30 === 0 && aging.days31to60 === 0 &&
                  aging.days61to90 === 0 && aging.days90plus === 0 && (
                    <p className="text-xs text-gray-400">No aging data available</p>
                  )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Clean entities */}
      {noOutstanding.length > 0 && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs font-medium text-green-700 mb-2">Fully collected — no outstanding balance</p>
          <div className="flex flex-wrap gap-2">
            {noOutstanding.map((e) => (
              <span key={e.org.id} className="text-xs bg-white text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                {e.org.short}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Group outstanding summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Group outstanding by aging bucket (MYR equiv.)</h3>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Not yet due', key: 'current', color: 'bg-green-100 text-green-800' },
            { label: '1–30 days', key: 'days1to30', color: 'bg-yellow-100 text-yellow-800' },
            { label: '31–60 days', key: 'days31to60', color: 'bg-orange-100 text-orange-800' },
            { label: '61–90 days', key: 'days61to90', color: 'bg-red-100 text-red-700' },
            { label: '90+ days', key: 'days90plus', color: 'bg-red-200 text-red-900' },
          ].map(({ label, key, color }) => {
            const total = entities.reduce(
              (s, e) => s + (e.arAging[key as keyof typeof e.arAging] as number) * e.org.fxToMyr,
              0
            )
            return (
              <div key={key} className={`rounded-lg p-3 ${color}`}>
                <p className="text-xs font-medium mb-1">{label}</p>
                <p className="text-base font-semibold tabular-nums">{fmtMyr(total)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
