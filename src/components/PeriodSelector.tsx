'use client'

import type { PeriodDef, PeriodMode } from '@/types'

interface Props {
  value: PeriodDef
  onChange: (p: PeriodDef) => void
  loading?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getAvailableYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = 2023; y <= current; y++) years.push(y)
  return years.reverse()
}

export function PeriodSelector({ value, onChange, loading }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const setMode = (mode: PeriodMode) => {
    if (mode === 'month') {
      onChange({ mode: 'month', year: value.year, month: value.month ?? currentMonth })
    } else if (mode === 'quarter') {
      const q = value.quarter ?? Math.ceil((value.month ?? currentMonth) / 3) as 1 | 2 | 3 | 4
      onChange({ mode: 'quarter', year: value.year, quarter: q })
    } else {
      onChange({ mode: 'ytd', year: value.year })
    }
  }

  const setYear = (year: number) => {
    if (value.mode === 'month') {
      const maxMonth = year === currentYear ? currentMonth : 12
      const month = Math.min(value.month ?? currentMonth, maxMonth)
      onChange({ ...value, year, month })
    } else if (value.mode === 'quarter') {
      const maxQ = year === currentYear ? Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4 : 4
      const quarter = Math.min(value.quarter ?? 1, maxQ) as 1 | 2 | 3 | 4
      onChange({ ...value, year, quarter })
    } else {
      onChange({ ...value, year })
    }
  }

  const maxMonth = value.year === currentYear ? currentMonth : 12
  const maxQuarter = value.year === currentYear
    ? (Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4)
    : 4

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Mode selector */}
      <div className="flex rounded-lg border border-gray-700 overflow-hidden">
        {(['month', 'quarter', 'ytd'] as PeriodMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              value.mode === m
                ? 'bg-hexa-gradient text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {m === 'ytd' ? 'YTD' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Year selector */}
      <select
        value={value.year}
        onChange={(e) => setYear(parseInt(e.target.value))}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-hexa-purple"
      >
        {getAvailableYears().map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {/* Month selector */}
      {value.mode === 'month' && (
        <select
          value={value.month ?? currentMonth}
          onChange={(e) => onChange({ ...value, month: parseInt(e.target.value) })}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-hexa-purple"
        >
          {MONTHS.slice(0, maxMonth).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      )}

      {/* Quarter selector */}
      {value.mode === 'quarter' && (
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {([1, 2, 3, 4] as const).map((q) => (
            <button
              key={q}
              disabled={q > maxQuarter}
              onClick={() => onChange({ ...value, quarter: q })}
              className={`px-3 py-1.5 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed ${
                value.quarter === q
                  ? 'bg-hexa-gradient text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Q{q}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-full border-2 border-hexa-purple border-t-transparent animate-spin" />
          Loading…
        </div>
      )}
    </div>
  )
}
