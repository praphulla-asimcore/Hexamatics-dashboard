'use client'

import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import type { EntitySummary } from '@/types'

ChartJS.register(ArcElement, Tooltip)

const STATUS_COLORS: Record<string, string> = {
  paid:           '#10b981',
  overdue:        '#ef4444',
  sent:           '#8B18E8',
  draft:          '#6b7280',
  void:           '#374151',
  partially_paid: '#f59e0b',
  viewed:         '#C219A0',
  approved:       '#3b82f6',
}

interface Props { entities: EntitySummary[] }

export function StatusDonutChart({ entities }: Props) {
  const agg: Record<string, number> = {}
  entities.forEach((e) =>
    Object.entries(e.period.statusBreakdown).forEach(([s, c]) => {
      agg[s] = (agg[s] || 0) + c
    })
  )

  const labels = Object.keys(agg)
  const values = Object.values(agg)
  const total = values.reduce((a, b) => a + b, 0)
  const colors = labels.map((s) => STATUS_COLORS[s] || '#9ca3af')

  return (
    <div className="flex items-center gap-6">
      <div className="w-32 h-32 flex-shrink-0">
        <Doughnut
          data={{
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) =>
                    ` ${ctx.label}: ${ctx.parsed} (${((ctx.parsed / total) * 100).toFixed(1)}%)`,
                },
              },
            },
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {labels.map((s, i) => (
          <div key={s} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colors[i] }} />
              <span className="text-gray-400 capitalize">{s.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-white font-medium">{values[i]}</span>
              <span className="text-gray-600">{((values[i] / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
