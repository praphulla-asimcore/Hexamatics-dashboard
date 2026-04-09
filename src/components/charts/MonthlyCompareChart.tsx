'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface Props {
  jan: number
  feb: number
}

export function MonthlyCompareChart({ jan, feb }: Props) {
  const momPct = jan > 0 ? ((feb - jan) / jan) * 100 : 0

  const data = {
    labels: ['January 2026', 'February 2026'],
    datasets: [
      {
        data: [Math.round(jan), Math.round(feb)],
        backgroundColor: ['#bfdbfe', '#2563eb'],
        borderRadius: 6,
      },
    ],
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xs text-gray-400">MoM change</span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            momPct >= 0 ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {momPct >= 0 ? '+' : ''}
          {momPct.toFixed(1)}%
        </span>
      </div>
      <div className="h-44">
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
                    ` MYR ${ctx.parsed.y.toLocaleString()}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 11 } } },
              y: {
                ticks: {
                  font: { size: 10 },
                  callback: (v) => {
                    const n = Number(v)
                    return `MYR ${(n / 1_000_000).toFixed(1)}M`
                  },
                },
                grid: { color: 'rgba(0,0,0,0.05)' },
              },
            },
          }}
        />
      </div>
    </div>
  )
}
