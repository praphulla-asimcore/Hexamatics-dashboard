'use client'

import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import type { EntitySummary } from '@/types'
import { monthLabel, ENTITY_COLORS } from '@/lib/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  entities: EntitySummary[]
}

export function TrendLineChart({ entities }: Props) {
  // Collect all unique year-month keys from trends
  const keySet = new Set<string>()
  entities.forEach((e) =>
    e.monthlyTrend.forEach((m) => keySet.add(`${m.year}-${String(m.month).padStart(2, '0')}`))
  )
  const keys = Array.from(keySet).sort()
  const labels = keys.map((k) => {
    const [y, m] = k.split('-').map(Number)
    return monthLabel(y, m)
  })

  const activeEntities = entities.filter((e) => e.monthlyTrend.some((m) => m.totalMyr > 0))

  // Group line: sum of all entities per month
  const groupData = keys.map((k) => {
    const [y, m] = k.split('-').map(Number)
    return activeEntities.reduce((sum, e) => {
      const pt = e.monthlyTrend.find((t) => t.year === y && t.month === m)
      return sum + (pt?.totalMyr ?? 0)
    }, 0)
  })

  const datasets: any[] = [
    {
      label: 'Group Total',
      data: groupData.map(Math.round),
      borderColor: '#8B18E8',
      backgroundColor: 'rgba(139,24,232,0.08)',
      borderWidth: 2.5,
      pointRadius: 3,
      fill: true,
      tension: 0.35,
    },
    ...activeEntities.slice(0, 6).map((e, i) => ({
      label: e.org.short,
      data: keys.map((k) => {
        const [y, m] = k.split('-').map(Number)
        const pt = e.monthlyTrend.find((t) => t.year === y && t.month === m)
        return Math.round(pt?.totalMyr ?? 0)
      }),
      borderColor: ENTITY_COLORS[i],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 2,
      borderDash: [],
      tension: 0.35,
    })),
  ]

  return (
    <div className="h-56">
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { font: { size: 9 }, boxWidth: 8, color: '#6b7280', padding: 10 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: MYR ${Number(ctx.parsed.y).toLocaleString()}`,
              },
            },
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#6b7280' }, grid: { display: false } },
            y: {
              ticks: {
                font: { size: 9 }, color: '#6b7280',
                callback: (v) => {
                  const n = Number(v)
                  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
                  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
                  return String(n)
                },
              },
              grid: { color: 'rgba(255,255,255,0.04)' },
            },
          },
        }}
      />
    </div>
  )
}
