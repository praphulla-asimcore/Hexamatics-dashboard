'use client'

import { useState } from 'react'
import type { PeriodDef, PeriodMode, ComparisonMode } from '@/types'

interface Props {
  value: PeriodDef
  onChange: (p: PeriodDef) => void
  loading?: boolean
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getAvailableYears() {
  const current = new Date().getFullYear()
  const years = []
  for (let y = 2023; y <= current; y++) years.push(y)
  return years.reverse()
}

const MODES: { key: PeriodMode; label: string }[] = [
  { key: 'month',     label: 'Month'      },
  { key: 'quarter',   label: 'Quarter'    },
  { key: 'half',      label: 'Half'       },
  { key: 'year',      label: 'Year'       },
  { key: 'ytd',       label: 'YTD'        },
  { key: 'rolling12', label: 'Rolling 12M'},
  { key: 'custom',    label: 'Custom'     },
]

const COMPARISONS: { key: ComparisonMode; label: string }[] = [
  { key: 'previous', label: 'vs Prior Period' },
  { key: 'yoy',      label: 'vs Last Year'    },
  { key: 'none',     label: 'No Comparison'   },
]

export function PeriodSelector({ value, onChange, loading }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [customFrom, setCustomFrom] = useState(value.customFrom ?? '')
  const [customTo,   setCustomTo]   = useState(value.customTo   ?? '')

  const setMode = (mode: PeriodMode) => {
    const base: PeriodDef = { mode, year: value.year, comparison: value.comparison ?? 'previous' }
    if (mode === 'month')     onChange({ ...base, month: value.month ?? currentMonth })
    else if (mode === 'quarter') {
      const q = value.quarter ?? (Math.ceil((value.month ?? currentMonth) / 3) as 1|2|3|4)
      onChange({ ...base, quarter: q })
    } else if (mode === 'half') {
      const h = value.half ?? ((value.month ?? currentMonth) <= 6 ? 1 : 2)
      onChange({ ...base, half: h as 1|2 })
    } else if (mode === 'rolling12') {
      onChange({ mode: 'rolling12', year: currentYear, comparison: value.comparison ?? 'previous' })
    } else if (mode === 'custom') {
      onChange({ ...base, mode: 'custom', customFrom: customFrom || undefined, customTo: customTo || undefined })
    } else {
      onChange(base)
    }
  }

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    onChange({
      mode: 'custom',
      year: new Date(customFrom).getFullYear(),
      comparison: value.comparison ?? 'previous',
      customFrom,
      customTo,
    })
  }

  const setYear = (year: number) => {
    const maxMonth = year === currentYear ? currentMonth : 12
    if (value.mode === 'month')
      onChange({ ...value, year, month: Math.min(value.month ?? currentMonth, maxMonth) })
    else if (value.mode === 'quarter') {
      const maxQ = year === currentYear ? Math.ceil(currentMonth / 3) as 1|2|3|4 : 4
      onChange({ ...value, year, quarter: Math.min(value.quarter ?? 1, maxQ) as 1|2|3|4 })
    } else if (value.mode === 'half') {
      const maxH = year === currentYear && currentMonth <= 6 ? 1 : 2
      onChange({ ...value, year, half: Math.min(value.half ?? 1, maxH) as 1|2 })
    } else {
      onChange({ ...value, year })
    }
  }

  const maxMonth   = value.year === currentYear ? currentMonth : 12
  const maxQuarter = value.year === currentYear ? (Math.ceil(currentMonth / 3) as 1|2|3|4) : 4
  const maxHalf: 1|2 = (value.year === currentYear && currentMonth <= 6) ? 1 : 2

  const btnBase = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap'
  const btnActive = `${btnBase} bg-hexa-gradient text-white shadow-sm`
  const btnInactive = `${btnBase} text-gray-500 hover:text-gray-900 hover:bg-black/[0.05]`

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Mode buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-0.5 bg-black/[0.04] rounded-xl p-1 flex-wrap">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={value.mode === m.key ? btnActive : btnInactive}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Year — hidden for rolling12 and custom */}
        {value.mode !== 'rolling12' && value.mode !== 'custom' && (
          <select value={value.year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-black/[0.10] bg-white/80 text-gray-700 focus:outline-none focus:ring-2 focus:ring-hexa-purple">
            {getAvailableYears().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {/* Month */}
        {value.mode === 'month' && (
          <select value={value.month ?? currentMonth}
            onChange={(e) => onChange({ ...value, month: parseInt(e.target.value) })}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-black/[0.10] bg-white/80 text-gray-700 focus:outline-none focus:ring-2 focus:ring-hexa-purple">
            {MONTHS.slice(0, maxMonth).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        )}

        {/* Quarter */}
        {value.mode === 'quarter' && (
          <div className="flex gap-0.5 bg-black/[0.04] rounded-xl p-1">
            {([1,2,3,4] as const).map((q) => (
              <button key={q} disabled={q > maxQuarter} onClick={() => onChange({ ...value, quarter: q })}
                className={value.quarter === q ? btnActive : `${btnInactive} disabled:opacity-30 disabled:cursor-not-allowed`}>
                Q{q}
              </button>
            ))}
          </div>
        )}

        {/* Half */}
        {value.mode === 'half' && (
          <div className="flex gap-0.5 bg-black/[0.04] rounded-xl p-1">
            {([1,2] as const).map((h) => (
              <button key={h} disabled={h > maxHalf} onClick={() => onChange({ ...value, half: h })}
                className={(value.half ?? 1) === h ? btnActive : `${btnInactive} disabled:opacity-30`}>
                H{h}
              </button>
            ))}
          </div>
        )}

        {/* Custom date pickers */}
        {value.mode === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">From</span>
              <input type="date" value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={customTo || undefined}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border border-black/[0.10] bg-white/80 text-gray-700 focus:outline-none focus:ring-2 focus:ring-hexa-purple" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">To</span>
              <input type="date" value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom || undefined}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border border-black/[0.10] bg-white/80 text-gray-700 focus:outline-none focus:ring-2 focus:ring-hexa-purple" />
            </div>
            <button onClick={applyCustom} disabled={!customFrom || !customTo}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-hexa-gradient text-white disabled:opacity-40 transition">
              Apply
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full border-2 border-hexa-purple border-t-transparent animate-spin" />
            Loading…
          </div>
        )}
      </div>

      {/* Row 2: Comparison */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Compare:</span>
        <div className="flex gap-0.5 bg-black/[0.04] rounded-lg p-0.5">
          {COMPARISONS.map((c) => (
            <button key={c.key} onClick={() => onChange({ ...value, comparison: c.key })}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                (value.comparison ?? 'previous') === c.key
                  ? 'bg-white shadow-sm text-gray-900 border border-black/[0.06]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
