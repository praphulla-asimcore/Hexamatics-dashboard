'use client'

interface Props {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  trend?: 'up' | 'down' | 'warn'
}

export function KpiCard({ label, value, sub, highlight, trend }: Props) {
  const trendColor =
    trend === 'up' ? 'text-green-600' :
    trend === 'down' ? 'text-red-500' :
    trend === 'warn' ? 'text-amber-600' :
    'text-gray-400'

  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight
          ? 'bg-blue-600 border-blue-700 text-white'
          : 'bg-white border-gray-200'
      }`}
    >
      <p className={`text-xs font-medium mb-1.5 ${highlight ? 'text-blue-200' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${highlight ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1.5 ${highlight ? 'text-blue-200' : trendColor}`}>
          {sub}
        </p>
      )}
    </div>
  )
}
