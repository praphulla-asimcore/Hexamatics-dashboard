'use client'

import type { PeriodDef, PeriodMode, ComparisonMode } from '@/types'

interface Props {
  value: PeriodDef
  onChange: (p: PeriodDef) => void
  loading?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getAvailableYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = 2023; y <= current; y++) years.push(y)
  return years.reverse()
}

const MODES: { key: PeriodMode; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'half', label: 'Half' },
  { key: 'year', label: 'Year' },
  { key: 'ytd', label: 'YTD' },
  { key: 'rolling12', label: 'Rolling 12M' },
]

const COMPARISONS: { key: ComparisonMode; label: string }[] = [
  { key: 'previous', label: 'vs Prior Period' },
  { key: 'yoy', label: 'vs Last Year' },
  { key: 'none', label: 'No Comparison' },
]

export function PeriodSelector({ value, onChange, loading }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const setMode = (mode: PeriodMode) => {
    const base: PeriodDef = { mode, year: value.year, comparison: value.comparison ?? 'previous' }
    if (mode === 'month') {
      onChange({ ...base, month: value.month ?? currentMonth })
    } else if (mode === 'quarter') {
      const q = value.quarter ?? (Math.ceil((value.month ?? currentMonth) / 3) as 1 | 2 | 3 | 4)
      onChange({ ...base, quarter: q })
    } else if (mode === 'half') {
      const h = value.half ?? ((value.month ?? currentMonth) <= 6 ? 1 : 2)
      onChange({ ...base, half: h as 1 | 2 })
    } else if (mode === 'rolling12') {
      onChange({ mode: 'rolling12', year: currentYear, comparison: value.comparison ?? 'previous' })
    } else {
      onChange(base)
    }
  }

  const setYear = (year: number) => {
    const maxMonth = year === currentYear ? currentMonth : 12
    if (value.mode === 'month') {
      onChange({ ...value, year, month: Math.min(value.month ?? currentMonth, maxMonth) })
    } else if (value.mode === 'quarter') {
      const maxQ = year === currentYear ? Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4 : 4
      onChange({ ...value, year, quarter: Math.min(value.quarter ?? 1, maxQ) as 1 | 2 | 3 | 4 })
    } else if (value.mode === 'half') {
      const maxH = year === currentYear && currentMonth <= 6 ? 1 : 2
      onChange({ ...value, year, half: Math.min(value.half ?? 1, maxH) as 1 | 2 })
    } else {
      onChange({ ...value, year })
    }
  }

  const setComparison = (comparison: ComparisonMode) => {
    onChange({ ...value, comparison })
  }

  const maxMonth = value.year === currentYear ? currentMonth : 12
  const maxQuarter = value.year === currentYear
    ? (Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4)
    : 4
  const maxHalf: 1 | 2 = (value.year === currentYear && currentMonth <= 6) ? 1 : 2

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Mode + Year + Sub-selectors */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode selector */}
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                value.mode === m.key
                  ? 'bg-hexa-gradient text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Year selector — hidden for rolling12 */}
        {value.mode !== 'rolling12' && (
          <select
            value={value.year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-hexa-purple"
          >
            {getAvailableYears().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

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

        {/* Half selector */}
        {value.mode === 'half' && (
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {([1, 2] as const).map((h) => (
              <button
                key={h}
                disabled={h > maxHalf}
                onClick={() => onChange({ ...value, half: h })}
                className={`px-4 py-1.5 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed ${
                  (value.half ?? 1) === h
                    ? 'bg-hexa-gradient text-white'
                    : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                H{h}
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

      {/* Row 2: Comparison toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">Compare:</span>
        <div className="flex rounded-md border border-gray-800 overflow-hidden">
          {COMPARISONS.map((c) => (
            <button
              key={c.key}
              onClick={() => setComparison(c.key)}
              className={`px-2.5 py-1 text-[11px] font-medium transition ${
                (value.comparison ?? 'previous') === c.key
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-900 text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
