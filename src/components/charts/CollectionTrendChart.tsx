'use client'

import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend,
} from 'chart.js'
import type { EntitySummary } from '@/types'
import { monthLabel, ENTITY_COLORS } from '@/lib/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface Props {
  entities: EntitySummary[]
}

export function CollectionTrendChart({ entities }: Props) {
  // Collect all unique year-month keys
  const keySet = new Set<string>()
  entities.forEach((e) =>
    e.monthlyTrend.forEach((m) => keySet.add(`${m.year}-${String(m.month).padStart(2, '0')}`))
  )
  const keys = Array.from(keySet).sort()
  const labels = keys.map((k) => {
    const [y, m] = k.split('-').map(Number)
    return monthLabel(y, m)
  })

  const activeEntities = entities.filter((e) =>
    e.monthlyTrend.some((m) => m.totalLocal > 0)
  )

  // Group collection rate: sum collected MYR / sum total MYR per month
  const groupRateData = keys.map((k) => {
    const [y, m] = k.split('-').map(Number)
    let totalMyr = 0, collectedMyr = 0
    activeEntities.forEach((e) => {
      const pt = e.monthlyTrend.find((t) => t.year === y && t.month === m)
      if (pt && pt.totalLocal > 0) {
        totalMyr += pt.totalMyr
        collectedMyr += pt.collected * e.org.fxToMyr
      }
    })
    return totalMyr > 0 ? Math.round((collectedMyr / totalMyr) * 100 * 10) / 10 : null
  })

  const entityDatasets = activeEntities.slice(0, 5).map((e, i) => ({
    label: e.org.short,
    data: keys.map((k) => {
      const [y, m] = k.split('-').map(Number)
      const pt = e.monthlyTrend.find((t) => t.year === y && t.month === m)
      if (!pt || pt.totalLocal === 0) return null
      return Math.round((pt.collected / pt.totalLocal) * 100 * 10) / 10
    }),
    borderColor: ENTITY_COLORS[i] + 'aa',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    pointRadius: 2,
    tension: 0.3,
    spanGaps: true,
  }))

  const datasets: any[] = [
    {
      label: 'Group',
      data: groupRateData,
      borderColor: '#8B18E8',
      backgroundColor: 'rgba(139,24,232,0.08)',
      borderWidth: 2.5,
      pointRadius: 3,
      tension: 0.35,
      fill: false,
      spanGaps: true,
    },
    ...entityDatasets,
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
                label: (ctx) => {
                  const v = ctx.parsed.y
                  return v !== null ? ` ${ctx.dataset.label}: ${v}%` : ` ${ctx.dataset.label}: —`
                },
              },
            },
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#6b7280' }, grid: { display: false } },
            y: {
              min: 0,
              max: 100,
              ticks: {
                font: { size: 9 }, color: '#6b7280',
                callback: (v) => `${v}%`,
              },
              grid: { color: 'rgba(255,255,255,0.04)' },
            },
          },
        }}
      />
    </div>
  )
}
