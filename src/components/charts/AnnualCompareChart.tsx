'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
} from 'chart.js'
import type { AnnualYearData } from '@/types'
import { ENTITY_COLORS } from '@/lib/format'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  data: AnnualYearData[]
}

export function AnnualCompareChart({ data }: Props) {
  if (!data.length) return null

  // Only include entities that have revenue in at least one year
  const activeOrgs = data[0].entities
    .map((e, i) => ({ ...e, colorIdx: i }))
    .filter((e) => data.some((y) => {
      const row = y.entities.find((r) => r.orgId === e.orgId)
      return (row?.totalMyr ?? 0) > 0
    }))

  const labels = data.map((d) => String(d.year))

  const datasets = activeOrgs.map((org) => ({
    label: org.orgShort,
    data: data.map((y) => {
      const row = y.entities.find((r) => r.orgId === org.orgId)
      return Math.round(row?.totalMyr ?? 0)
    }),
    backgroundColor: ENTITY_COLORS[org.colorIdx % ENTITY_COLORS.length],
    borderRadius: 3,
    stack: 'revenue',
  }))

  return (
    <div className="h-64">
      <Bar
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { font: { size: 9 }, boxWidth: 10, color: '#6b7280', padding: 10 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: MYR ${Number(ctx.parsed.y ?? 0).toLocaleString()}`,
                footer: (items) => {
                  const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0)
                  return `Total: MYR ${Math.round(total).toLocaleString()}`
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { font: { size: 11 }, color: '#9ca3af' },
              grid: { display: false },
            },
            y: {
              stacked: true,
              ticks: {
                font: { size: 10 }, color: '#6b7280',
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
