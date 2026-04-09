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

export function RevenueBarChart({ entities }: Props) {
  const active = entities.filter((e) => e.ytd.totalMyr > 0)

  const data = {
    labels: active.map((e) => e.org.short),
    datasets: [
      {
        label: 'January',
        data: active.map((e) => Math.round(e.jan.totalMyr)),
        backgroundColor: '#93c5fd',
        borderRadius: 3,
      },
      {
        label: 'February',
        data: active.map((e) => Math.round(e.feb.totalMyr)),
        backgroundColor: '#2563eb',
        borderRadius: 3,
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
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.dataset.label}: MYR ${ctx.parsed.y.toLocaleString()}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 10 }, maxRotation: 35 },
              grid: { display: false },
            },
            y: {
              ticks: {
                font: { size: 10 },
                callback: (v) => {
                  const n = Number(v)
                  if (n >= 1_000_000) return `MYR ${(n / 1_000_000).toFixed(1)}M`
                  if (n >= 1_000) return `MYR ${(n / 1_000).toFixed(0)}K`
                  return `MYR ${n}`
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
