'use client'

import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import type { EntitySummary } from '@/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props { entities: EntitySummary[] }

export function ArAgingChart({ entities }: Props) {
  const active = entities.filter((e) => e.period.outstanding > 0)

  const toMyr = (e: EntitySummary, val: number) => Math.round(val * e.org.fxToMyr)

  const data = {
    labels: active.map((e) => e.org.short),
    datasets: [
      { label: 'Not yet due',  data: active.map((e) => toMyr(e, e.arAging.current)),    backgroundColor: '#10b981', borderRadius: 2 },
      { label: '1–30 days',    data: active.map((e) => toMyr(e, e.arAging.days1to30)),  backgroundColor: '#f59e0b', borderRadius: 2 },
      { label: '31–60 days',   data: active.map((e) => toMyr(e, e.arAging.days31to60)), backgroundColor: '#f97316', borderRadius: 2 },
      { label: '61–90 days',   data: active.map((e) => toMyr(e, e.arAging.days61to90)), backgroundColor: '#ef4444', borderRadius: 2 },
      { label: '90+ days',     data: active.map((e) => toMyr(e, e.arAging.days90plus)), backgroundColor: '#7f1d1d', borderRadius: 2 },
    ],
  }

  return (
    <div className="h-56">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true, position: 'bottom',
              labels: { font: { size: 9 }, boxWidth: 8, color: '#6b7280', padding: 8 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: MYR ${Number(ctx.parsed.y ?? 0).toLocaleString()}`,
              },
            },
          },
          scales: {
            x: { stacked: true, ticks: { font: { size: 9 }, color: '#6b7280', maxRotation: 30 }, grid: { display: false } },
            y: {
              stacked: true,
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
