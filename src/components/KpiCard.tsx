'use client'

import { Tilt3D } from './Tilt3D'

interface Props {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  trend?: 'up' | 'down' | 'warn' | 'neutral'
  badge?: string
}

export function KpiCard({ label, value, sub, highlight, trend, badge }: Props) {
  const trendColor =
    trend === 'up'   ? 'text-emerald-400' :
    trend === 'down' ? 'text-red-400'     :
    trend === 'warn' ? 'text-amber-400'   :
    'text-gray-400'

  if (highlight) {
    return (
      <Tilt3D className="kpi-card-enter">
        <div className="kpi-card relative rounded-xl p-5 overflow-hidden bg-gray-900 border border-gray-700">
          {/* Top strip — light mode */}
          <div className="kpi-top-strip absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-hexa-gradient" />
          {/* Left strip — dark mode */}
          <div className="kpi-left-strip absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-hexa-gradient" />
          <p className="text-xs font-medium text-gray-400 mb-1.5 mt-1">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-transparent bg-clip-text bg-hexa-gradient-r leading-tight print:text-gray-900">
            {value}
          </p>
          {sub && <p className={`text-xs mt-1.5 ${trendColor}`}>{sub}</p>}
          {badge && (
            <span className="absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-hexa-purple/20 text-hexa-purple">
              {badge}
            </span>
          )}
        </div>
      </Tilt3D>
    )
  }

  return (
    <Tilt3D className="kpi-card-enter">
      <div className="kpi-card relative rounded-xl p-5 bg-gray-900 border border-gray-800 overflow-hidden">
        <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-white leading-tight">{value}</p>
        {sub && <p className={`text-xs mt-1.5 ${trendColor}`}>{sub}</p>}
        {badge && (
          <span className="mt-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {badge}
          </span>
        )}
      </div>
    </Tilt3D>
  )
}
