'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import type { EntitySummary } from '@/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  entities: EntitySummary[]
}

export function ArAgingChart({ entities }: Props) {
  const active = entities.filter((e) => e.ytd.outstanding > 0)

  const toMyr = (e: EntitySummary, val: number) => Math.round(val * e.org.fxToMyr)

  const data = {
    labels: active.map((e) => e.org.short),
    datasets: [
      {
        label: 'Not yet due',
        data: active.map((e) => toMyr(e, e.arAging.current)),
        backgroundColor: '#86efac',
        borderRadius: 2,
      },
      {
        label: '1–30 days',
        data: active.map((e) => toMyr(e, e.arAging.days1to30)),
        backgroundColor: '#fde68a',
        borderRadius: 2,
      },
      {
        label: '31–60 days',
        data: active.map((e) => toMyr(e, e.arAging.days31to60)),
        backgroundColor: '#fdba74',
        borderRadius: 2,
      },
      {
        label: '61–90 days',
        data: active.map((e) => toMyr(e, e.arAging.days61to90)),
        backgroundColor: '#f87171',
        borderRadius: 2,
      },
      {
        label: '90+ days',
        data: active.map((e) => toMyr(e, e.arAging.days90plus)),
        backgroundColor: '#dc2626',
        borderRadius: 2,
      },
    ],
  }

  return (
    <div className="h-52">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { font: { size: 10 }, boxWidth: 10, padding: 8 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: MYR ${ctx.parsed.y.toLocaleString()}`,
              },
            },
          },
          scales: {
            x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 35 }, grid: { display: false } },
            y: {
              stacked: true,
              ticks: {
                font: { size: 10 },
                callback: (v) => {
                  const n = Number(v)
                  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
                  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
                  return String(n)
                },
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
          },
        }}
      />
    </div>
  )
}
