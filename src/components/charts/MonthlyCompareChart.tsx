'use client'

import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface Props {
  currentTotal: number
  prevTotal: number
  periodLabel: string
  comparisonLabel: string
}

export function MonthlyCompareChart({ currentTotal, prevTotal, periodLabel, comparisonLabel }: Props) {
  const pctChange = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0

  const data = {
    labels: [periodLabel, comparisonLabel].filter(Boolean),
    datasets: [
      {
        data: [Math.round(currentTotal), Math.round(prevTotal)],
        backgroundColor: ['#8B18E8', '#4838E855'],
        borderRadius: 6,
      },
    ],
  }

  return (
    <div>
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
                  label: (ctx) => ` MYR ${Number(ctx.parsed.y).toLocaleString()}`,
                },
              },
            },
            scales: {
              x: { ticks: { font: { size: 11 }, color: '#9ca3af' }, grid: { display: false } },
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
                grid: { color: 'rgba(255,255,255,0.04)' },
              },
            },
          }}
        />
      </div>
      {prevTotal > 0 && (
        <p className={`text-center text-xs mt-2 font-semibold ${pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}% vs {comparisonLabel}
        </p>
      )}
    </div>
  )
}
