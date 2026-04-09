'use client'

import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import type { EntitySummary } from '@/types'
import { ENTITY_COLORS } from '@/lib/format'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  entities: EntitySummary[]
  periodLabel: string
  comparisonLabel: string
}

export function RevenueBarChart({ entities, periodLabel, comparisonLabel }: Props) {
  const active = entities.filter((e) => e.period.totalMyr > 0 || (e.comparison?.totalMyr ?? 0) > 0)

  const datasets: any[] = [
    {
      label: periodLabel,
      data: active.map((e) => Math.round(e.period.totalMyr)),
      backgroundColor: active.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]),
      borderRadius: 4,
    },
  ]

  if (active.some((e) => e.comparison?.totalMyr)) {
    datasets.push({
      label: comparisonLabel,
      data: active.map((e) => Math.round(e.comparison?.totalMyr ?? 0)),
      backgroundColor: active.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length] + '55'),
      borderRadius: 4,
    })
  }

  return (
    <div className="h-56">
      <Bar
        data={{ labels: active.map((e) => e.org.short), datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: datasets.length > 1,
              position: 'top',
              labels: { font: { size: 10 }, boxWidth: 10, color: '#9ca3af' },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: MYR ${Number(ctx.parsed.y ?? 0).toLocaleString()}`,
              },
            },
          },
          scales: {
            x: { ticks: { font: { size: 10 }, color: '#6b7280', maxRotation: 30 }, grid: { display: false } },
            y: {
              ticks: {
                font: { size: 10 }, color: '#6b7280',
                callback: (v) => {
                  const n = Number(v)
                  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
                  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
                  return String(n)
                },
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
          },
        }}
      />
    </div>
  )
}
