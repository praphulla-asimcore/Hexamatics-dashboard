'use client'

import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import type { EntitySummary } from '@/types'
import { ENTITY_COLORS } from '@/lib/format'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  entities: EntitySummary[]
}

export function RevenueMixDonutChart({ entities }: Props) {
  const active = entities.filter((e) => e.period.totalMyr > 0)
  const total = active.reduce((s, e) => s + e.period.totalMyr, 0)

  if (!active.length || total === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-xs">
        No revenue data
      </div>
    )
  }

  return (
    <div className="flex items-center gap-6">
      <div className="w-44 h-44 flex-shrink-0">
        <Doughnut
          data={{
            labels: active.map((e) => e.org.short),
            datasets: [{
              data: active.map((e) => Math.round(e.period.totalMyr)),
              backgroundColor: active.map((e) => ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length]),
              borderColor: '#111827',
              borderWidth: 2,
              hoverOffset: 6,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const pct = total > 0 ? ((Number(ctx.parsed) / total) * 100).toFixed(1) : '0'
                    return ` ${ctx.label}: MYR ${Number(ctx.parsed).toLocaleString()} (${pct}%)`
                  },
                },
              },
            },
          }}
        />
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {active
          .sort((a, b) => b.period.totalMyr - a.period.totalMyr)
          .map((e) => {
            const pct = total > 0 ? (e.period.totalMyr / total) * 100 : 0
            return (
              <div key={e.org.id} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }}
                />
                <span className="text-xs text-gray-400 truncate flex-1">{e.org.short}</span>
                <span className="text-xs font-semibold text-white tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
