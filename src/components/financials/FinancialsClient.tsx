'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { ORGS } from '@/lib/orgs'
import {
  buildConsolidatedPL, buildConsolidatedBS, buildConsolidatedCF,
  generatePLInsights, generateBSInsights, generateCFInsights,
  variance, varianceLabel, insightColor, insightIcon,
} from '@/lib/financial-analytics'
import { getFinancialPeriodLabel } from '@/lib/financial-period'
import { onRefresh, dispatchRefresh, bumpDataVersion } from '@/lib/refresh-event'
import { BoardReportView } from './BoardReportView'
import type {
  FinancialPeriod, PLStatement, BalanceSheetStatement, CashFlowStatement,
  ConsolidatedPL, ConsolidatedBS, ConsolidatedCF, FSLineItem, CFOInsight,
} from '@/types/financials'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler
)

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ENTITY_COLORS = [
  '#8B18E8','#E8177A','#1B1BE8','#18E8A8','#E8A818','#E84018','#18C4E8','#B8E818','#E818D0',
]

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = 'pl' | 'bs' | 'cf'
type ViewMode = 'consolidated' | string // 'consolidated' or orgId

// ─── Number formatters ────────────────────────────────────────────────────────

function fmtNum(n: number, decimals = 0): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(decimals)
}

function fmtCurrency(n: number, currency = 'MYR'): string {
  if (n === 0) return '—'
  const neg = n < 0
  const abs = Math.abs(n)
  const formatted = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
    ? `${(abs / 1_000).toFixed(1)}K`
    : abs.toFixed(0)
  return `${neg ? '(' : ''}${currency} ${formatted}${neg ? ')' : ''}`
}

function fmtPct(n: number): string {
  if (n === 0) return '—'
  return `${n >= 0 ? '' : ''}${n.toFixed(1)}%`
}

function varColor(v: number, inverse = false): string {
  if (v === 0) return 'text-gray-500'
  const positive = inverse ? v < 0 : v > 0
  return positive ? 'text-emerald-400' : 'text-red-400'
}

// ─── Period Selector ─────────────────────────────────────────────────────────

function PeriodSelector({
  period, onChange,
}: { period: FinancialPeriod; onChange: (p: FinancialPeriod) => void }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const MIN_YEAR = 2023
  const MIN_DATE = '2023-01-01'
  const MAX_DATE = now.toISOString().slice(0, 10)
  const years = Array.from({ length: currentYear - MIN_YEAR + 1 }, (_, i) => currentYear - i)
  const maxMonth   = period.year === currentYear ? currentMonth : 12
  const maxQuarter = period.year === currentYear ? (Math.ceil(currentMonth / 3) as 1|2|3|4) : 4
  const maxHalf: 1|2 = (period.year === currentYear && currentMonth <= 6) ? 1 : 2

  const [customFrom, setCustomFrom] = useState(period.customFrom ?? '')
  const [customTo,   setCustomTo]   = useState(period.customTo   ?? '')

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    onChange({ ...period, mode: 'custom', customFrom, customTo })
  }

  const btnBase = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap'
  const btnActive = `${btnBase} bg-hexa-gradient text-white shadow-sm`
  const btnInactive = `${btnBase} text-gray-500 hover:text-white hover:bg-white/[0.06]`

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Mode */}
        <div className="flex items-center gap-0.5 bg-white/[0.06] rounded-xl p-1 flex-wrap">
          {(['month','quarter','half','year','custom'] as const).map((m) => (
            <button key={m} onClick={() => onChange({ ...period, mode: m })}
              className={period.mode === m ? btnActive : btnInactive}>
              {m === 'month' ? 'Month' : m === 'quarter' ? 'Quarter' : m === 'half' ? 'Half-Year' : m === 'year' ? 'Annual' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Year — hidden for custom */}
        {period.mode !== 'custom' && (
          <select value={period.year} onChange={(e) => onChange({ ...period, year: parseInt(e.target.value) })}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-white/[0.12] bg-white/[0.05] text-gray-200 focus:outline-none focus:ring-2 focus:ring-hexa-purple">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        )}

        {/* Month selector */}
        {period.mode === 'month' && (
          <select value={period.month ?? now.getMonth() + 1}
            onChange={(e) => onChange({ ...period, month: parseInt(e.target.value) })}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-white/[0.12] bg-white/[0.05] text-gray-200 focus:outline-none focus:ring-2 focus:ring-hexa-purple">
            {MONTHS.slice(0, maxMonth).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        )}

        {/* Quarter selector */}
        {period.mode === 'quarter' && (
          <div className="flex gap-0.5 bg-white/[0.06] rounded-xl p-1">
            {([1,2,3,4] as const).map((q) => (
              <button key={q} disabled={q > maxQuarter} onClick={() => onChange({ ...period, quarter: q })}
                className={period.quarter === q ? btnActive : `${btnInactive} disabled:opacity-30 disabled:cursor-not-allowed`}>
                Q{q}
              </button>
            ))}
          </div>
        )}

        {/* Half selector */}
        {period.mode === 'half' && (
          <div className="flex gap-0.5 bg-white/[0.06] rounded-xl p-1">
            {([1,2] as const).map((h) => (
              <button key={h} disabled={h > maxHalf} onClick={() => onChange({ ...period, half: h })}
                className={period.half === h ? btnActive : `${btnInactive} disabled:opacity-30 disabled:cursor-not-allowed`}>
                H{h}
              </button>
            ))}
          </div>
        )}

        {/* Custom date pickers */}
        {period.mode === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">From</span>
              <input type="date" value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                min={MIN_DATE}
                max={customTo || MAX_DATE}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border border-white/[0.12] bg-white/[0.05] text-gray-200 focus:outline-none focus:ring-2 focus:ring-hexa-purple" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">To</span>
              <input type="date" value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom || MIN_DATE}
                max={MAX_DATE}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border border-white/[0.12] bg-white/[0.05] text-gray-200 focus:outline-none focus:ring-2 focus:ring-hexa-purple" />
            </div>
            <button onClick={applyCustom} disabled={!customFrom || !customTo}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-hexa-gradient text-white disabled:opacity-40 transition">
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Comparison */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Compare:</span>
        <div className="flex gap-0.5 bg-white/[0.06] rounded-lg p-0.5">
          {(['previous','yoy','none'] as const).map((c) => (
            <button key={c} onClick={() => onChange({ ...period, comparison: c })}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                period.comparison === c
                  ? 'bg-white/10 shadow-sm text-white border border-white/[0.10]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}>
              {c === 'previous' ? 'vs Prior Period' : c === 'yoy' ? 'vs Last Year' : 'No Compare'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Statement Row ────────────────────────────────────────────────────────────

function StatementRow({
  item, currency, fxRate, compItem, compFxRate,
  indent = 0, isTotal = false, isNegative = false,
}: {
  item: FSLineItem
  currency: string
  fxRate: number
  compItem?: FSLineItem
  compFxRate?: number
  indent?: number
  isTotal?: boolean
  isNegative?: boolean
}) {
  const [open, setOpen] = useState(true)
  const hasSubs = item.subItems && item.subItems.length > 0

  const myr = item.amount * fxRate
  const compMyr = compItem ? compItem.amount * (compFxRate ?? fxRate) : null
  const varPct = compMyr !== null && compMyr !== 0
    ? ((myr - compMyr) / Math.abs(compMyr)) * 100
    : null

  const rowClass = isTotal
    ? 'font-semibold text-white border-t border-purple-500/15'
    : hasSubs
    ? 'font-medium text-gray-300'
    : 'text-gray-500'

  return (
    <>
      <tr className={`${rowClass} hover:bg-purple-500/10 transition`}>
        <td className="py-1.5 pr-4" style={{ paddingLeft: `${indent * 16 + 12}px` }}>
          <div className="flex items-center gap-1.5">
            {hasSubs && (
              <button onClick={() => setOpen((o) => !o)}
                className="text-gray-500 hover:text-gray-200 text-xs w-4 flex-shrink-0">
                {open ? '▾' : '▸'}
              </button>
            )}
            <span className="truncate max-w-xs">{item.account}</span>
          </div>
        </td>
        <td className={`py-1.5 text-right tabular-nums ${item.amount < 0 ? 'text-red-400' : ''}`}>
          {item.amount !== 0 ? fmtCurrency(isNegative ? -item.amount : item.amount, currency) : '—'}
        </td>
        <td className={`py-1.5 text-right tabular-nums text-gray-500 ${myr < 0 ? 'text-red-400/70' : ''}`}>
          {myr !== 0 ? fmtCurrency(isNegative ? -myr : myr, 'MYR') : '—'}
        </td>
        <td className={`py-1.5 text-right tabular-nums text-gray-400`}>
          {compMyr !== null ? fmtCurrency(isNegative ? -compMyr : compMyr, 'MYR') : '—'}
        </td>
        <td className={`py-1.5 text-right tabular-nums text-xs ${
          varPct !== null ? varColor(varPct, isNegative) : 'text-gray-400'
        }`}>
          {varPct !== null ? varianceLabel(varPct) : '—'}
        </td>
      </tr>
      {hasSubs && open && item.subItems!.map((sub, i) => (
        <StatementRow key={i} item={sub} currency={currency} fxRate={fxRate}
          compItem={compItem?.subItems?.[i]} compFxRate={compFxRate}
          indent={indent + 1} isNegative={isNegative} />
      ))}
    </>
  )
}

// ─── Statement Table ──────────────────────────────────────────────────────────

function StatementTable({ children, comparisonLabel }: { children: React.ReactNode; comparisonLabel?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-purple-500/15">
            <th className="text-left pb-2 pl-3 font-medium">Account</th>
            <th className="text-right pb-2 font-medium">Local Currency</th>
            <th className="text-right pb-2 font-medium">MYR (FX Adj.)</th>
            <th className="text-right pb-2 font-medium text-gray-400">{comparisonLabel ?? 'Prior Period'}</th>
            <th className="text-right pb-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
      </table>
    </div>
  )
}

// ─── Section Header Row ───────────────────────────────────────────────────────

function SectionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={5} className="py-3 pl-3 text-[10px] font-bold text-hexa-purple uppercase tracking-widest bg-purple-500/10 border-b border-purple-500/15">
        {label}
      </td>
    </tr>
  )
}

function TotalRow({
  label, amount, currency, fxRate, compAmount, compFxRate, highlight = false, isNegative = false,
}: {
  label: string; amount: number; currency: string; fxRate: number
  compAmount?: number; compFxRate?: number; highlight?: boolean; isNegative?: boolean
}) {
  const myr = amount * fxRate
  const compMyr = compAmount !== undefined ? compAmount * (compFxRate ?? fxRate) : undefined
  const varPct = compMyr !== undefined && compMyr !== 0
    ? ((myr - compMyr) / Math.abs(compMyr)) * 100 : undefined

  return (
    <tr className={`font-bold border-t-2 ${highlight ? 'border-hexa-purple bg-purple-500/10' : 'border-purple-500/20 bg-white/[0.03]'}`}>
      <td className="py-2 pl-3 text-white">{label}</td>
      <td className={`py-2 text-right tabular-nums ${amount < 0 ? 'text-red-400' : 'text-white'}`}>
        {fmtCurrency(isNegative ? -amount : amount, currency)}
      </td>
      <td className={`py-2 text-right tabular-nums ${myr < 0 ? 'text-red-400' : highlight ? 'text-hexa-purple' : 'text-gray-300'}`}>
        {fmtCurrency(isNegative ? -myr : myr, 'MYR')}
      </td>
      <td className="py-2 text-right tabular-nums text-gray-500">
        {compMyr !== undefined ? fmtCurrency(isNegative ? -compMyr : compMyr, 'MYR') : '—'}
      </td>
      <td className={`py-2 text-right tabular-nums text-sm ${
        varPct !== undefined ? varColor(varPct, isNegative) : 'text-gray-400'
      }`}>
        {varPct !== undefined ? varianceLabel(varPct) : '—'}
      </td>
    </tr>
  )
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, change, suffix = '' }: {
  label: string; value: string; change?: number; suffix?: string
}) {
  return (
    <div className="kpi-card kpi-card-enter rounded-xl p-4 relative overflow-hidden">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}{suffix}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 font-medium ${varColor(change)}`}>
          {varianceLabel(change)} vs prior
        </p>
      )}
    </div>
  )
}

// ─── Chart theme ─────────────────────────────────────────────────────────────

const CHART_OPTIONS: any = {
  responsive: true,
  animation: { duration: 650, easing: 'easeOutQuart' },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#cbd5e1', font: { size: 11 },
        boxWidth: 10, boxHeight: 10, padding: 14,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(17,17,26,0.96)',
      borderColor: 'rgba(139,24,232,0.30)',
      borderWidth: 1,
      titleColor: '#f8fafc',
      bodyColor: '#cbd5e1',
      padding: 10,
      cornerRadius: 10,
      callbacks: {
        label: (ctx: any) => `  ${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#94a3b8', font: { size: 11 } },
      grid: { color: 'rgba(139,24,232,0.10)' },
      border: { display: false },
    },
    y: {
      ticks: {
        color: '#94a3b8', font: { size: 11 },
        callback: (v: any) => {
          const abs = Math.abs(v)
          if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
          if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`
          return v
        },
      },
      grid: { color: 'rgba(139,24,232,0.10)' },
      border: { display: false },
    },
  },
}

const DONUT_OPTIONS: any = {
  responsive: true,
  animation: { duration: 650, easing: 'easeOutQuart' },
  cutout: '60%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10, boxHeight: 10, padding: 8 },
    },
    tooltip: {
      backgroundColor: 'rgba(17,17,26,0.96)',
      borderColor: 'rgba(139,24,232,0.30)',
      borderWidth: 1,
      titleColor: '#f8fafc',
      bodyColor: '#cbd5e1',
      padding: 10,
      cornerRadius: 10,
      callbacks: {
        label: (ctx: any) => `  ${ctx.label}: ${fmtCurrency(ctx.parsed)}`,
      },
    },
  },
}

// ─── Helper: flatten FSLineItem tree to leaf items ────────────────────────────

function getLeafItems(items: FSLineItem[]): FSLineItem[] {
  const result: FSLineItem[] = []
  for (const item of items) {
    if (item.subItems && item.subItems.length > 0) {
      result.push(...getLeafItems(item.subItems))
    } else if (item.amount !== 0) {
      result.push(item)
    }
  }
  return result.length > 0 ? result : items.filter((i) => i.amount !== 0)
}

// ─── Insights Panel ───────────────────────────────────────────────────────────

function InsightsPanel({ insights }: { insights: CFOInsight[] }) {
  if (!insights.length) return null
  return (
    <div className="insights-panel space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">CFO Insights</h3>
      {insights.map((ins, i) => (
        <div key={i} className={`rounded-lg border p-3 ${insightColor(ins.level)}`}>
          <div className="flex items-start gap-2">
            <span className="text-sm font-bold flex-shrink-0">{insightIcon(ins.level)}</span>
            <div>
              <p className="text-sm font-semibold">{ins.headline}</p>
              <p className="text-xs opacity-75 mt-0.5">{ins.detail}</p>
              <span className="text-xs opacity-50">{ins.category}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── P&L View ────────────────────────────────────────────────────────────────

function PLView({ statement, compLabel }: { statement: PLStatement; compLabel: string }) {
  const { data: d, comparison: c, currency, fxRate, comparisonFxRate } = statement

  const revenueGrowth = c && c.totalRevenue > 0
    ? variance(d.totalRevenue, c.totalRevenue) : undefined
  const marginGrowth = c ? d.netMargin - c.netMargin : undefined

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Revenue" value={fmtCurrency(d.totalRevenue, currency)}
          change={revenueGrowth} />
        <KpiCard label="Gross Profit" value={fmtCurrency(d.grossProfit, currency)}
          suffix={` (${fmtPct(d.grossMargin)})`}
          change={c ? variance(d.grossProfit, c.grossProfit) : undefined} />
        <KpiCard label="EBITDA" value={fmtCurrency(d.ebitda, currency)}
          suffix={` (${fmtPct(d.ebitdaMargin)})`}
          change={c ? variance(d.ebitda, c.ebitda) : undefined} />
        <KpiCard label="Net Profit" value={fmtCurrency(d.netProfit, currency)}
          suffix={` (${fmtPct(d.netMargin)})`}
          change={c ? variance(d.netProfit, c.netProfit) : undefined} />
      </div>

      {/* FX Note */}
      {currency !== 'MYR' && (
        <p className="text-xs text-gray-400">
          FX rate (avg): 1 {currency} = {fxRate.toFixed(4)} MYR (IAS 21 average rate for P&L)
        </p>
      )}

      {/* Statement table */}
      <StatementTable comparisonLabel={compLabel}>
        <SectionRow label="Revenue" />
        {d.revenue.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.revenue[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total Revenue" amount={d.totalRevenue} currency={currency} fxRate={fxRate}
          compAmount={c?.totalRevenue} compFxRate={comparisonFxRate} />

        <SectionRow label="Cost of Goods Sold" />
        {d.cogs.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.cogs[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total COGS" amount={d.totalCogs} currency={currency} fxRate={fxRate}
          compAmount={c?.totalCogs} compFxRate={comparisonFxRate} isNegative />

        <TotalRow label="GROSS PROFIT" amount={d.grossProfit} currency={currency} fxRate={fxRate}
          compAmount={c?.grossProfit} compFxRate={comparisonFxRate} highlight />

        <SectionRow label={`Operating Expenses  (Gross Margin: ${fmtPct(d.grossMargin)})`} />
        {d.operatingExpenses.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.operatingExpenses[i]} compFxRate={comparisonFxRate} indent={1} isNegative />
        ))}
        <TotalRow label="Total OPEX" amount={d.totalOpex} currency={currency} fxRate={fxRate}
          compAmount={c?.totalOpex} compFxRate={comparisonFxRate} isNegative />

        <TotalRow label={`EBITDA  (${fmtPct(d.ebitdaMargin)} margin)`}
          amount={d.ebitda} currency={currency} fxRate={fxRate}
          compAmount={c?.ebitda} compFxRate={comparisonFxRate} highlight />

        {(d.depreciation > 0 || d.amortization > 0) && (
          <>
            <SectionRow label="Depreciation & Amortization" />
            <TotalRow label="D&A" amount={d.depreciation + d.amortization}
              currency={currency} fxRate={fxRate} isNegative />
            <TotalRow label={`EBIT  (${fmtPct(d.ebitMargin)} margin)`}
              amount={d.ebit} currency={currency} fxRate={fxRate}
              compAmount={c?.ebit} compFxRate={comparisonFxRate} />
          </>
        )}

        {(d.totalOtherIncome > 0 || d.totalOtherExpenses > 0) && (
          <>
            <SectionRow label="Other Income / (Expenses)" />
            {d.otherIncome.map((item, i) => (
              <StatementRow key={i} item={item} currency={currency} fxRate={fxRate} indent={1} />
            ))}
            {d.otherExpenses.map((item, i) => (
              <StatementRow key={i} item={item} currency={currency} fxRate={fxRate} indent={1} isNegative />
            ))}
            <TotalRow label="Net Other Income/(Expense)"
              amount={d.totalOtherIncome - d.totalOtherExpenses} currency={currency} fxRate={fxRate} />
          </>
        )}

        <TotalRow label="PROFIT BEFORE TAX" amount={d.ebt} currency={currency} fxRate={fxRate}
          compAmount={c?.ebt} compFxRate={comparisonFxRate} />

        <SectionRow label={`Tax  (EBT margin: ${fmtPct(d.ebtMargin)})`} />
        {d.tax.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate} indent={1} isNegative />
        ))}
        <TotalRow label="Tax Expense" amount={d.totalTax} currency={currency} fxRate={fxRate}
          compAmount={c?.totalTax} compFxRate={comparisonFxRate} isNegative />

        <TotalRow label={`NET PROFIT  (${fmtPct(d.netMargin)} margin)`}
          amount={d.netProfit} currency={currency} fxRate={fxRate}
          compAmount={c?.netProfit} compFxRate={comparisonFxRate} highlight />
      </StatementTable>
    </div>
  )
}

// ─── Balance Sheet View ───────────────────────────────────────────────────────

function BSView({ statement, compLabel }: { statement: BalanceSheetStatement; compLabel: string }) {
  const { data: d, comparison: c, currency, fxRate, comparisonFxRate } = statement

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Assets" value={fmtCurrency(d.totalAssets, currency)}
          change={c ? variance(d.totalAssets, c.totalAssets) : undefined} />
        <KpiCard label="Working Capital" value={fmtCurrency(d.workingCapital, currency)}
          change={c ? variance(d.workingCapital, c.workingCapital) : undefined} />
        <KpiCard label="Current Ratio" value={d.currentRatio.toFixed(2)} suffix="x"
          change={c ? variance(d.currentRatio, c.currentRatio) : undefined} />
        <KpiCard label="Debt-to-Equity" value={d.debtToEquity.toFixed(2)} suffix="x"
          change={c ? variance(d.debtToEquity, c.debtToEquity) : undefined} />
      </div>

      {currency !== 'MYR' && (
        <p className="text-xs text-gray-400">
          FX rate (closing): 1 {currency} = {fxRate.toFixed(4)} MYR (IAS 21 closing rate for BS)
        </p>
      )}

      <StatementTable comparisonLabel={compLabel}>
        {/* Assets */}
        <SectionRow label="ASSETS" />
        <SectionRow label="Current Assets" />
        {d.currentAssets.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.currentAssets[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total Current Assets" amount={d.totalCurrentAssets}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalCurrentAssets} compFxRate={comparisonFxRate} />

        <SectionRow label="Non-Current Assets" />
        {d.nonCurrentAssets.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.nonCurrentAssets[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total Non-Current Assets" amount={d.totalNonCurrentAssets}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalNonCurrentAssets} compFxRate={comparisonFxRate} />

        <TotalRow label="TOTAL ASSETS" amount={d.totalAssets} currency={currency} fxRate={fxRate}
          compAmount={c?.totalAssets} compFxRate={comparisonFxRate} highlight />

        {/* Liabilities */}
        <SectionRow label="LIABILITIES" />
        <SectionRow label="Current Liabilities" />
        {d.currentLiabilities.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.currentLiabilities[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total Current Liabilities" amount={d.totalCurrentLiabilities}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalCurrentLiabilities} compFxRate={comparisonFxRate} />

        <SectionRow label="Non-Current Liabilities" />
        {d.nonCurrentLiabilities.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.nonCurrentLiabilities[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Total Non-Current Liabilities" amount={d.totalNonCurrentLiabilities}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalNonCurrentLiabilities} compFxRate={comparisonFxRate} />

        <TotalRow label="TOTAL LIABILITIES" amount={d.totalLiabilities}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalLiabilities} compFxRate={comparisonFxRate} />

        {/* Equity */}
        <SectionRow label="EQUITY" />
        {d.equity.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.equity[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="TOTAL EQUITY" amount={d.totalEquity}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalEquity} compFxRate={comparisonFxRate} highlight />

        <TotalRow label="TOTAL LIABILITIES & EQUITY" amount={d.totalLiabilitiesAndEquity}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalLiabilitiesAndEquity} compFxRate={comparisonFxRate} />
      </StatementTable>
    </div>
  )
}

// ─── Cash Flow View ───────────────────────────────────────────────────────────

function CFView({ statement, compLabel }: { statement: CashFlowStatement; compLabel: string }) {
  const { data: d, comparison: c, currency, fxRate, comparisonFxRate } = statement

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Operating CF" value={fmtCurrency(d.totalOperating, currency)}
          change={c ? variance(d.totalOperating, c.totalOperating) : undefined} />
        <KpiCard label="Investing CF" value={fmtCurrency(d.totalInvesting, currency)}
          change={c ? variance(d.totalInvesting, c.totalInvesting) : undefined} />
        <KpiCard label="Free Cash Flow" value={fmtCurrency(d.freeCashFlow, currency)}
          change={c ? variance(d.freeCashFlow, c.freeCashFlow) : undefined} />
        <KpiCard label="Net Cash Change" value={fmtCurrency(d.netCashChange, currency)}
          change={c ? variance(d.netCashChange, c.netCashChange) : undefined} />
      </div>

      {currency !== 'MYR' && (
        <p className="text-xs text-gray-400">
          FX rate (avg): 1 {currency} = {fxRate.toFixed(4)} MYR (IAS 21 average rate)
        </p>
      )}

      <StatementTable comparisonLabel={compLabel}>
        <SectionRow label="OPERATING ACTIVITIES" />
        {d.operatingActivities.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.operatingActivities[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Net Cash from Operations" amount={d.totalOperating}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalOperating} compFxRate={comparisonFxRate} highlight />

        <SectionRow label="INVESTING ACTIVITIES" />
        {d.investingActivities.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.investingActivities[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Net Cash from Investing" amount={d.totalInvesting}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalInvesting} compFxRate={comparisonFxRate} />

        <SectionRow label="FINANCING ACTIVITIES" />
        {d.financingActivities.map((item, i) => (
          <StatementRow key={i} item={item} currency={currency} fxRate={fxRate}
            compItem={c?.financingActivities[i]} compFxRate={comparisonFxRate} indent={1} />
        ))}
        <TotalRow label="Net Cash from Financing" amount={d.totalFinancing}
          currency={currency} fxRate={fxRate}
          compAmount={c?.totalFinancing} compFxRate={comparisonFxRate} />

        <TotalRow label="NET CHANGE IN CASH" amount={d.netCashChange}
          currency={currency} fxRate={fxRate}
          compAmount={c?.netCashChange} compFxRate={comparisonFxRate} highlight />

        <TotalRow label="Opening Cash Balance" amount={d.openingBalance}
          currency={currency} fxRate={fxRate} compAmount={c?.openingBalance} compFxRate={comparisonFxRate} />
        <TotalRow label="Closing Cash Balance" amount={d.closingBalance}
          currency={currency} fxRate={fxRate} compAmount={c?.closingBalance} compFxRate={comparisonFxRate} />
        <TotalRow label="Free Cash Flow" amount={d.freeCashFlow}
          currency={currency} fxRate={fxRate} compAmount={c?.freeCashFlow} compFxRate={comparisonFxRate} />
      </StatementTable>
    </div>
  )
}

// ─── Consolidated P&L View ────────────────────────────────────────────────────

function ConsolidatedPLView({ data, insights }: { data: ConsolidatedPL; insights: CFOInsight[] }) {
  const { group: g, entities, comparison } = data
  const cg = comparison?.group

  // Entity charts
  const activeEntities = entities.filter((e) => !e.error && e.data.totalRevenue > 0)

  const barData = {
    labels: activeEntities.map((e) => e.orgShort),
    datasets: [
      {
        label: 'Revenue (MYR)',
        data: activeEntities.map((e) => e.data.totalRevenue * e.fxRate),
        backgroundColor: activeEntities.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length] + 'AA'),
        borderColor: activeEntities.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]),
        borderWidth: 1.5,
        borderRadius: 6,
      },
      {
        label: 'Gross Profit (MYR)',
        data: activeEntities.map((e) => e.data.grossProfit * e.fxRate),
        backgroundColor: activeEntities.map(() => '#10B98155'),
        borderColor: activeEntities.map(() => '#10B981'),
        borderWidth: 1.5,
        borderRadius: 6,
      },
      {
        label: 'Net Profit (MYR)',
        data: activeEntities.map((e) => e.data.netProfit * e.fxRate),
        backgroundColor: activeEntities.map((e) =>
          e.data.netProfit >= 0 ? '#6366f166' : '#EF444466'
        ),
        borderColor: activeEntities.map((e) =>
          e.data.netProfit >= 0 ? '#6366f1' : '#EF4444'
        ),
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ],
  }

  const donutData = {
    labels: activeEntities.map((e) => e.orgShort),
    datasets: [{
      data: activeEntities.map((e) => e.data.totalRevenue * e.fxRate),
      backgroundColor: activeEntities.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length] + 'BB'),
      borderColor: activeEntities.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]),
      borderWidth: 2,
      hoverOffset: 10,
    }],
  }

  // P&L cascade data
  const cascade = [
    { label: 'Revenue',      value: g.totalRevenueMyr, pct: 100,                    color: '#8B18E8' },
    { label: 'Gross Profit', value: g.grossProfitMyr,  pct: g.grossMarginPct,       color: '#6366f1' },
    { label: 'EBITDA',       value: g.ebitdaMyr,       pct: g.ebitdaMarginPct,      color: '#06b6d4' },
    { label: 'EBIT',         value: g.ebitMyr,         pct: g.ebitMarginPct,        color: '#0ea5e9' },
    { label: 'Net Profit',   value: g.netProfitMyr,    pct: g.netMarginPct,
      color: g.netProfitMyr >= 0 ? '#059669' : '#dc2626' },
  ]
  const maxCascadeVal = Math.max(...cascade.map((c) => Math.abs(c.value)), 1)

  // Revenue & COGS segment aggregation
  const revMap: Record<string, number> = {}
  const cogsMap: Record<string, number> = {}
  entities.filter((e) => !e.error && e.data.revenue).forEach((e) => {
    const fx = e.fxRate
    getLeafItems(e.data.revenue ?? []).forEach((item) => {
      const k = item.account || 'Other Revenue'
      revMap[k] = (revMap[k] ?? 0) + item.amount * fx
    })
    getLeafItems(e.data.cogs ?? []).forEach((item) => {
      const k = item.account || 'Other COGS'
      cogsMap[k] = (cogsMap[k] ?? 0) + Math.abs(item.amount) * fx
    })
  })
  const revItems = Object.entries(revMap)
    .map(([name, myr]) => ({ name, myr }))
    .filter((x) => x.myr > 0)
    .sort((a, b) => b.myr - a.myr)
  const cogsItems = Object.entries(cogsMap)
    .map(([name, myr]) => ({ name, myr }))
    .filter((x) => x.myr > 0)
    .sort((a, b) => b.myr - a.myr)

  return (
    <div className="space-y-6">
      {/* Group KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Group Revenue" value={fmtCurrency(g.totalRevenueMyr)}
          change={cg ? variance(g.totalRevenueMyr, cg.totalRevenueMyr) : undefined} />
        <KpiCard label="Gross Margin" value={fmtPct(g.grossMarginPct)}
          change={cg ? g.grossMarginPct - cg.grossMarginPct : undefined} />
        <KpiCard label="EBITDA Margin" value={fmtPct(g.ebitdaMarginPct)}
          change={cg ? g.ebitdaMarginPct - cg.ebitdaMarginPct : undefined} />
        <KpiCard label="Net Profit" value={fmtCurrency(g.netProfitMyr)}
          change={cg ? variance(g.netProfitMyr, cg.netProfitMyr) : undefined} />
      </div>

      {/* Charts row */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-100">Revenue, GP & Net Profit by Entity</h3>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">MYR</span>
        </div>
        <Bar data={barData} options={CHART_OPTIONS} height={120} />
      </div>

      {/* P&L Cascade */}
      <div className="pl-cascade bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="section-accent-bar" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-gray-100">P&L Cascade — Group Consolidated (MYR)</h3>
            {cg && <span className="text-[10px] text-gray-400 font-medium">vs prior period shown in summary table below</span>}
          </div>
          <div className="space-y-3">
            {cascade.map((item) => {
              const barPct = (Math.abs(item.value) / maxCascadeVal) * 100
              const isNeg = item.value < 0
              const textOnBar = barPct > 35
              return (
                <div key={item.label} className="flex items-center gap-4">
                  <div className="w-24 text-xs font-semibold text-gray-400 text-right shrink-0">{item.label}</div>
                  <div className="flex-1 relative h-9 rounded-lg overflow-hidden bg-white/[0.06]">
                    <div
                      className="h-full rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(barPct, 1)}%`,
                        background: isNeg
                          ? 'linear-gradient(90deg, #ef4444, #f87171)'
                          : `linear-gradient(90deg, ${item.color}DD, ${item.color}99)`,
                      }}
                    />
                    <span
                      className="absolute inset-0 flex items-center px-3 text-xs font-bold tabular-nums"
                      style={{ color: textOnBar ? '#fff' : (isNeg ? '#dc2626' : item.color) }}
                    >
                      {fmtCurrency(item.value)}
                    </span>
                  </div>
                  <div
                    className="w-14 text-right text-xs font-bold shrink-0 tabular-nums"
                    style={{ color: isNeg ? '#dc2626' : item.color }}
                  >
                    {item.pct.toFixed(1)}%
                  </div>
                  {cg && (() => {
                    const compVal = item.label === 'Revenue' ? cg.totalRevenueMyr
                      : item.label === 'Gross Profit' ? cg.grossProfitMyr
                      : item.label === 'EBITDA' ? cg.ebitdaMyr
                      : item.label === 'EBIT' ? cg.ebitMyr
                      : cg.netProfitMyr
                    const chg = compVal !== 0 ? variance(item.value, compVal) : null
                    return (
                      <div className={`w-16 text-right text-[11px] font-semibold shrink-0 ${chg !== null ? varColor(chg) : 'text-gray-400'}`}>
                        {chg !== null ? varianceLabel(chg) : '—'}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Revenue & COGS breakdown */}
      {revItems.length > 0 && (
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="section-accent-bar" />
          <div className="p-5">
            <h3 className="text-sm font-semibold text-gray-100 mb-5">Revenue, COGS & Gross Profit by Account</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Revenue */}
              <div>
                <p className="text-[10px] font-bold text-hexa-purple uppercase tracking-widest mb-3">Revenue Breakdown</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-purple-500/15">
                      <th className="text-left pb-2 font-medium">Account</th>
                      <th className="text-right pb-2 font-medium">MYR</th>
                      <th className="text-right pb-2 font-medium">% Rev</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {revItems.map((item) => {
                      const pct = g.totalRevenueMyr > 0 ? (item.myr / g.totalRevenueMyr) * 100 : 0
                      return (
                        <tr key={item.name} className="hover:bg-purple-500/15 transition">
                          <td className="py-2 text-gray-300 font-medium">{item.name}</td>
                          <td className="py-2 text-right tabular-nums text-white font-semibold">{fmtCurrency(item.myr)}</td>
                          <td className="py-2 text-right tabular-nums text-gray-500 text-xs">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                    <tr className="font-bold border-t-2 border-hexa-purple/30 bg-purple-500/10">
                      <td className="py-2.5 text-hexa-purple pl-1">Total Revenue</td>
                      <td className="py-2.5 text-right tabular-nums text-hexa-purple">{fmtCurrency(g.totalRevenueMyr)}</td>
                      <td className="py-2.5 text-right text-gray-400 text-xs">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* COGS + GP */}
              <div>
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3">COGS Breakdown</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-red-500/20">
                      <th className="text-left pb-2 font-medium">Account</th>
                      <th className="text-right pb-2 font-medium">MYR</th>
                      <th className="text-right pb-2 font-medium">% Rev</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-500/10">
                    {cogsItems.length > 0 ? cogsItems.map((item) => {
                      const pct = g.totalRevenueMyr > 0 ? (item.myr / g.totalRevenueMyr) * 100 : 0
                      return (
                        <tr key={item.name} className="hover:bg-red-500/10 transition">
                          <td className="py-2 text-gray-300 font-medium">{item.name}</td>
                          <td className="py-2 text-right tabular-nums text-red-400 font-semibold">({fmtCurrency(item.myr)})</td>
                          <td className="py-2 text-right tabular-nums text-gray-500 text-xs">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    }) : (
                      <tr><td colSpan={3} className="py-3 text-xs text-gray-400 italic">No COGS data available</td></tr>
                    )}
                    <tr className="font-bold border-t-2 border-red-500/30">
                      <td className="py-2 text-gray-300">Total COGS</td>
                      <td className="py-2 text-right tabular-nums text-red-400">({fmtCurrency(g.totalCogsMyr)})</td>
                      <td className="py-2 text-right text-gray-400 text-xs">
                        {g.totalRevenueMyr > 0 ? `${(g.totalCogsMyr / g.totalRevenueMyr * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                    <tr className="font-bold border-t-2 border-emerald-500/30 bg-emerald-500/10">
                      <td className="py-2.5 text-emerald-400 pl-1">Gross Profit</td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-400">{fmtCurrency(g.grossProfitMyr)}</td>
                      <td className="py-2.5 text-right text-emerald-400 text-xs font-bold">{g.grossMarginPct.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entity breakdown table */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="section-accent-bar" />
        <div className="p-5">
          <h3 className="text-sm font-semibold text-gray-100 mb-4">Entity Performance Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-500 border-b border-purple-500/15 uppercase tracking-wider">
                  <th className="text-left pb-2.5 font-medium">Entity</th>
                  <th className="text-right pb-2.5 font-medium">Revenue (Local)</th>
                  <th className="text-right pb-2.5 font-medium">Revenue (MYR)</th>
                  <th className="text-right pb-2.5 font-medium">Gross Margin</th>
                  <th className="text-right pb-2.5 font-medium">EBITDA Margin</th>
                  <th className="text-right pb-2.5 font-medium">Net Margin</th>
                  <th className="text-right pb-2.5 font-medium">Net Profit (MYR)</th>
                  <th className="text-right pb-2.5 font-medium">Rev Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {entities.map((e, i) => {
                  const revMyr = e.data.totalRevenue * e.fxRate
                  const share = g.totalRevenueMyr > 0 ? (revMyr / g.totalRevenueMyr) * 100 : 0
                  return (
                    <tr key={e.orgId} className="hover:bg-purple-500/10 transition">
                      <td className="py-2.5 font-semibold text-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white"
                            style={{ backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                          {e.orgShort}
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-gray-500">
                        {e.error ? '—' : fmtCurrency(e.data.totalRevenue, e.currency)}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-100">
                        {e.error ? <span className="text-red-400">Error</span> : fmtCurrency(revMyr)}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.grossMargin < 20 ? 'text-red-400' : 'text-gray-300'}`}>
                        {e.error ? '—' : fmtPct(e.data.grossMargin)}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.ebitdaMargin < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                        {e.error ? '—' : fmtPct(e.data.ebitdaMargin)}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.netMargin < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {e.error ? '—' : fmtPct(e.data.netMargin)}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.netProfit * e.fxRate < 0 ? 'text-red-400' : 'text-gray-100'}`}>
                        {e.error ? '—' : fmtCurrency(e.data.netProfit * e.fxRate)}
                      </td>
                      <td className="py-2.5 text-right text-gray-500">{fmtPct(share)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Insights */}
      <InsightsPanel insights={insights} />
    </div>
  )
}

// ─── Consolidated BS View ─────────────────────────────────────────────────────

function ConsolidatedBSView({ data, insights }: { data: ConsolidatedBS; insights: CFOInsight[] }) {
  const { group: g, entities } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Assets" value={fmtCurrency(g.totalAssetsMyr)} />
        <KpiCard label="Total Liabilities" value={fmtCurrency(g.totalLiabilitiesMyr)} />
        <KpiCard label="Total Equity" value={fmtCurrency(g.totalEquityMyr)} />
        <KpiCard label="Current Ratio" value={g.currentRatio.toFixed(2)} suffix="x" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-100">Capital Structure</h3>
          <Doughnut
            data={{
              labels: ['Equity', 'Total Liabilities'],
              datasets: [{
                data: [Math.max(0, g.totalEquityMyr), g.totalLiabilitiesMyr],
                backgroundColor: ['#10B98188','#EF444488'],
                borderColor: ['#10B981','#EF4444'],
                borderWidth: 2,
                hoverOffset: 8,
              }],
            }}
            options={DONUT_OPTIONS}
          />
          <div className="text-xs text-gray-500 text-center font-medium">D/E Ratio: {g.debtToEquity.toFixed(2)}x</div>
        </div>

        <div className="lg:col-span-2 bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-gray-100 mb-4">Entity Balance Sheet Summary (MYR)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-500 border-b border-purple-500/15 uppercase tracking-wider">
                <th className="text-left pb-2.5 font-medium">Entity</th>
                <th className="text-right pb-2.5 font-medium">Total Assets</th>
                <th className="text-right pb-2.5 font-medium">Total Liab.</th>
                <th className="text-right pb-2.5 font-medium">Equity</th>
                <th className="text-right pb-2.5 font-medium">Current Ratio</th>
                <th className="text-right pb-2.5 font-medium">D/E</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {entities.map((e) => (
                <tr key={e.orgId} className="hover:bg-purple-500/10 transition">
                  <td className="py-2.5 font-semibold text-gray-100">{e.orgShort}</td>
                  <td className="py-2.5 text-right text-gray-300">{e.error ? '—' : fmtCurrency(e.data.totalAssets * e.fxRate)}</td>
                  <td className="py-2.5 text-right text-gray-300">{e.error ? '—' : fmtCurrency(e.data.totalLiabilities * e.fxRate)}</td>
                  <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.totalEquity < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {e.error ? '—' : fmtCurrency(e.data.totalEquity * e.fxRate)}
                  </td>
                  <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.currentRatio < 1 ? 'text-red-400' : 'text-gray-300'}`}>
                    {e.error ? '—' : `${e.data.currentRatio.toFixed(2)}x`}
                  </td>
                  <td className={`py-2.5 text-right font-semibold ${!e.error && e.data.debtToEquity > 2 ? 'text-amber-400' : 'text-gray-300'}`}>
                    {e.error ? '—' : `${e.data.debtToEquity.toFixed(2)}x`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InsightsPanel insights={insights} />
    </div>
  )
}

// ─── Consolidated CF View ─────────────────────────────────────────────────────

function ConsolidatedCFView({ data, insights }: { data: ConsolidatedCF; insights: CFOInsight[] }) {
  const { group: g, entities } = data

  const cfEntities = entities.filter((e) => !e.error)

  const cfBarData = {
    labels: cfEntities.map((e) => e.orgShort),
    datasets: [
      {
        label: 'Operating CF',
        data: cfEntities.map((e) => e.data.totalOperating * e.fxRate),
        backgroundColor: '#10B98177',
        borderColor: '#10B981',
        borderWidth: 1.5,
        borderRadius: 6,
      },
      {
        label: 'Investing CF',
        data: cfEntities.map((e) => e.data.totalInvesting * e.fxRate),
        backgroundColor: '#F59E0B77',
        borderColor: '#F59E0B',
        borderWidth: 1.5,
        borderRadius: 6,
      },
      {
        label: 'Free Cash Flow',
        data: cfEntities.map((e) => e.data.freeCashFlow * e.fxRate),
        backgroundColor: cfEntities.map((e) =>
          e.data.freeCashFlow >= 0 ? '#8B18E888' : '#EF444488'
        ),
        borderColor: cfEntities.map((e) =>
          e.data.freeCashFlow >= 0 ? '#8B18E8' : '#EF4444'
        ),
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ],
  }

  // Cash flow summary bars
  const cfSummary = [
    { label: 'Operating CF', value: g.totalOperatingMyr, color: '#10B981' },
    { label: 'Investing CF', value: g.totalInvestingMyr, color: '#F59E0B' },
    { label: 'Financing CF', value: g.totalFinancingMyr, color: '#8B18E8' },
    { label: 'Free Cash Flow', value: g.freeCashFlowMyr, color: g.freeCashFlowMyr >= 0 ? '#059669' : '#dc2626' },
  ]
  const maxCFVal = Math.max(...cfSummary.map((c) => Math.abs(c.value)), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Operating CF" value={fmtCurrency(g.totalOperatingMyr)} />
        <KpiCard label="Investing CF" value={fmtCurrency(g.totalInvestingMyr)} />
        <KpiCard label="Financing CF" value={fmtCurrency(g.totalFinancingMyr)} />
        <KpiCard label="Free Cash Flow" value={fmtCurrency(g.freeCashFlowMyr)} />
      </div>

      <div className="chart-grid grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cascade */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="section-accent-bar" />
          <div className="p-5">
            <h3 className="text-sm font-semibold text-gray-100 mb-5">Cash Flow Summary (MYR)</h3>
            <div className="space-y-3">
              {cfSummary.map((item) => {
                const barPct = (Math.abs(item.value) / maxCFVal) * 100
                const isNeg = item.value < 0
                const textOnBar = barPct > 35
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-semibold text-gray-400 text-right shrink-0">{item.label}</div>
                    <div className="flex-1 relative h-9 rounded-lg overflow-hidden bg-white/[0.06]">
                      <div className="h-full rounded-lg transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(barPct, 1)}%`,
                          background: isNeg
                            ? 'linear-gradient(90deg, #ef4444, #f87171)'
                            : `linear-gradient(90deg, ${item.color}DD, ${item.color}88)`,
                        }} />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-bold tabular-nums"
                        style={{ color: textOnBar ? '#fff' : (isNeg ? '#dc2626' : item.color) }}>
                        {fmtCurrency(item.value)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Entity bar chart */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-100 mb-4">Cash Flow by Entity (MYR)</h3>
          <Bar data={cfBarData} options={CHART_OPTIONS} height={220} />
        </div>
      </div>

      <InsightsPanel insights={insights} />
    </div>
  )
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export function FinancialsClient() {
  const now = new Date()
  const [period, setPeriod] = useState<FinancialPeriod>({
    mode: 'month', year: now.getFullYear(),
    month: now.getMonth() + 1, comparison: 'previous',
  })
  const [activeTab, setActiveTab] = useState<TabType>('pl')
  const [view, setView] = useState<ViewMode>('consolidated')
  const [showBoardReport, setShowBoardReport] = useState(false)

  // Consolidated data (view === 'consolidated')
  const [plConsolidated, setPLConsolidated] = useState<ConsolidatedPL | null>(null)
  const [bsConsolidated, setBSConsolidated] = useState<ConsolidatedBS | null>(null)
  const [cfConsolidated, setCFConsolidated] = useState<ConsolidatedCF | null>(null)

  // Single entity data (view === orgId)
  const [plStatement, setPLStatement] = useState<PLStatement | null>(null)
  const [bsStatement, setBSStatement] = useState<BalanceSheetStatement | null>(null)
  const [cfStatement, setCFStatement] = useState<CashFlowStatement | null>(null)

  const [insights, setInsights] = useState<CFOInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string>('')

  function buildParams(extra: Record<string, string> = {}): string {
    const sp = new URLSearchParams({
      mode: period.mode, year: String(period.year), comparison: period.comparison,
    })
    if (period.month) sp.set('month', String(period.month))
    if (period.quarter) sp.set('quarter', String(period.quarter))
    if (period.half) sp.set('half', String(period.half))
    if (period.customFrom) sp.set('customFrom', period.customFrom)
    if (period.customTo)   sp.set('customTo',   period.customTo)
    if (view !== 'consolidated') sp.set('orgId', view)
    Object.entries(extra).forEach(([k, v]) => sp.set(k, v))
    return sp.toString()
  }

  // Abort controller — cancels in-flight fetches when period/tab/entity changes
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (tab: TabType, force = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const endpoint = tab === 'pl' ? 'pl' : tab === 'bs' ? 'bs' : 'cf'

    // ── Consolidated: single server-side call (API fetches all orgs sequentially
    // in one Lambda, caches 4 h). Both this page and Executive Summary hit the
    // same cached response → identical PAT figures, no token refresh races.
    if (view === 'consolidated') {
      clearData()

      const params = new URLSearchParams({
        mode: period.mode, year: String(period.year), comparison: period.comparison,
      })
      if (period.month)      params.set('month',      String(period.month))
      if (period.quarter)    params.set('quarter',    String(period.quarter))
      if (period.half)       params.set('half',       String(period.half))
      if (period.customFrom) params.set('customFrom', period.customFrom)
      if (period.customTo)   params.set('customTo',   period.customTo)
      if (force)             params.set('force',      '1')

      try {
        const res = await fetch(`/api/financials/${endpoint}?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json()

        if (!controller.signal.aborted) {
          setLastRefreshed(json.lastRefreshed ?? new Date().toISOString())
          if (tab === 'pl') { setPLConsolidated(json.consolidated); setInsights(json.insights ?? []) }
          else if (tab === 'bs') { setBSConsolidated(json.consolidated); setInsights(json.insights ?? []) }
          else { setCFConsolidated(json.consolidated); setInsights(json.insights ?? []) }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') { setLoading(false); return }
        setError(err.message ?? 'Failed to load consolidated data')
      }

      if (!controller.signal.aborted) setLoading(false)
      return
    }

    // ── Single entity fetch ───────────────────────────────────────────────────
    try {
      const params = buildParams(force ? { force: '1' } : {})
      const res = await fetch(`/api/financials/${endpoint}?${params}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setLastRefreshed(json.lastRefreshed ?? new Date().toISOString())

      if (tab === 'pl') setPLStatement(json.statement)
      else if (tab === 'bs') setBSStatement(json.statement)
      else setCFStatement(json.statement)
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message ?? 'Failed to load data')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, view])

  useEffect(() => {
    fetchData(activeTab)
  }, [fetchData, activeTab])

  // After a Sync Now: re-read current tab from the freshly-synced cache
  // (force=false → reads pg cache_store that the sync just populated)
  useEffect(() => {
    return onRefresh(() => fetchData(activeTab, false))
  }, [activeTab, fetchData])

  function clearData() {
    setPLConsolidated(null); setBSConsolidated(null); setCFConsolidated(null)
    setPLStatement(null); setBSStatement(null); setCFStatement(null)
  }

  function handlePeriodChange(p: FinancialPeriod) {
    setPeriod(p)
    clearData()
  }

  function handleViewChange(v: ViewMode) {
    setView(v)
    clearData()
  }

  const periodLabel = getFinancialPeriodLabel(period)
  const compLabel = period.comparison === 'none' ? ''
    : period.comparison === 'yoy' ? `${periodLabel.split(' ').slice(0, -1).join(' ')} ${period.year - 1}`
    : 'Prior Period'

  const hasData = plConsolidated || bsConsolidated || cfConsolidated || plStatement || bsStatement || cfStatement

  const handlePrint = () => window.print()

  // Sync Now — pulls fresh Zoho data for ALL THREE tabs + ALL entities into
  // PostgreSQL, then invalidates every page's client cache and re-reads.
  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      // Phase 1 — invoices (fast). Refreshes AR Dashboard + Exec Summary AR.
      setSyncMsg('Syncing invoices (all entities)…')
      const r1 = await fetch('/api/sync/run?mode=incremental&scope=invoices', { method: 'POST' })
      const j1 = await r1.json()
      if (!r1.ok || j1.error) throw new Error(j1.error || 'Invoice sync failed')

      bumpDataVersion()
      dispatchRefresh()   // AR + Exec re-read the freshly-synced invoices now
      setSyncMsg(`${j1.totalInvoices?.toLocaleString() ?? 0} invoices · refreshing financials…`)

      // Phase 2 — financial statements (slower Zoho Reports API).
      const r2 = await fetch('/api/sync/run?mode=incremental&scope=financials', { method: 'POST' })
      const j2 = await r2.json()
      if (!r2.ok || j2.error) throw new Error(j2.error || 'Financial sync failed')

      bumpDataVersion()
      dispatchRefresh()   // financials re-read from freshly-warmed cache
      setSyncMsg(`Synced · ${j1.totalInvoices?.toLocaleString() ?? 0} invoices · financials updated`)
      setTimeout(() => setSyncMsg(''), 6000)
    } catch (err: any) {
      setSyncMsg(`Sync failed: ${err.message}`)
      setTimeout(() => setSyncMsg(''), 8000)
    } finally {
      setSyncing(false)
    }
  }, [])

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {

          /* ── Page setup ─────────────────────────────────────────────── */
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 16mm 12mm;
          }

          /* ── Force background/color printing ────────────────────────── */
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── Global ─────────────────────────────────────────────────── */
          body {
            background: white !important;
            color: #0f172a !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
            font-size: 9pt !important;
            line-height: 1.45 !important;
          }

          /* ── Remove animations / transitions / blur ─────────────────── */
          * {
            animation: none !important;
            transition: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            box-shadow: none !important;
          }

          /* ── Hide interactive / screen-only UI ──────────────────────── */
          nav,
          .print\\:hidden,
          button, select, input[type="date"],
          .light-bg-layer { display: none !important; }

          /* ── Show print-only elements ────────────────────────────────── */
          .hidden.print\\:block { display: block !important; }
          .hidden.print\\:flex  { display: flex  !important; }

          /* ── Full width, no padding ──────────────────────────────────── */
          .max-w-screen-2xl { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .px-4, .px-6, .sm\\:px-6 { padding-left: 0 !important; padding-right: 0 !important; }

          /* ── Page break control ──────────────────────────────────────── */
          /* Small atomic elements + named sections that must stay whole */
          .kpi-card,
          .alert-critical, .alert-warning, .alert-good, .alert-info,
          .entity-mini-card { break-inside: avoid; }
          .pl-cascade { break-inside: avoid; }
          .insights-panel { break-inside: avoid; break-before: avoid; }
          .space-y-5 > * + *, .space-y-6 > * + * { margin-top: 8pt; }

          /* ── Glass containers → flat white with border ───────────────── */
          [class*="bg-white\\/"],
          [class*="bg-gray-9"],
          [class*="bg-gray-8"],
          [class*="backdrop-blur"] {
            background: white !important;
            border-radius: 6px !important;
          }

          /* ── Semi-transparent overlays → transparent ─────────────────── */
          [class*="bg-black\\/"],
          [class*="bg-white\\/\\["],
          [class*="bg-purple-50\\/"],
          [class*="bg-purple-500\\/"],
          [class*="bg-emerald-50\\/"],
          [class*="bg-emerald-500\\/"],
          [class*="bg-red-50\\/"],
          [class*="bg-red-500\\/"],
          [class*="bg-amber-500\\/"] {
            background: transparent !important;
          }

          /* ── Borders ─────────────────────────────────────────────────── */
          [class*="border-purple-"],
          [class*="border-black\\/"],
          [class*="border-white\\/"],
          [class*="divide-white\\/"],
          [class*="border-gray-7"],
          [class*="border-gray-8"] {
            border-color: #d1d5db !important;
          }
          .border-t-2 { border-top-width: 1.5pt !important; }
          .border-t-2.border-hexa-purple,
          [class*="border-hexa-purple"] { border-color: #8B18E8 !important; }
          [class*="border-emerald-3"]   { border-color: #6ee7b7 !important; }
          [class*="border-red-3"]       { border-color: #fca5a5 !important; }

          /* ── Section accent bar ──────────────────────────────────────── */
          .section-accent-bar {
            height: 2.5pt !important;
            background: linear-gradient(90deg, #E8177A, #8B18E8, #1B1BE8) !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }

          /* ── KPI cards ───────────────────────────────────────────────── */
          .kpi-card {
            background: #f8f5ff !important;
            border: 0.5pt solid #c4b5f4 !important;
            border-radius: 4px !important;
            padding: 6pt 8pt !important;
          }
          .kpi-top-strip {
            background: linear-gradient(90deg, #E8177A, #8B18E8, #1B1BE8) !important;
            height: 2pt !important;
          }

          /* ── Typography ──────────────────────────────────────────────── */
          .text-white, .text-gray-100,
          .text-gray-200, .text-gray-300 { color: #0f172a !important; }
          .text-gray-400, .text-gray-500 { color: #4b5563 !important; }
          .text-gray-600, .text-gray-700 { color: #6b7280 !important; }
          .text-gray-800, .text-gray-900 { color: #111827 !important; }
          .text-hexa-purple              { color: #7c3aed !important; }
          .text-emerald-400, .text-emerald-600,
          .text-emerald-700              { color: #059669 !important; }
          .text-red-400, .text-red-500,
          .text-red-600                  { color: #dc2626 !important; }
          .text-amber-400, .text-amber-500 { color: #d97706 !important; }
          .text-purple-300, .text-purple-400,
          .text-purple-500               { color: #7c3aed !important; }

          /* ── Tables ──────────────────────────────────────────────────── */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8pt !important;
          }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          th {
            padding: 3pt 5pt 3pt 5pt !important;
            font-size: 7pt !important;
            font-weight: 700 !important;
            color: #374151 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            border-bottom: 1.2pt solid #8B18E8 !important;
            background: #f5f3ff !important;
          }
          td {
            padding: 3pt 5pt !important;
            color: #0f172a !important;
            vertical-align: middle !important;
          }
          tbody tr { border-bottom: 0.4pt solid #f3f4f6 !important; }
          tbody tr:last-child { border-bottom: none !important; }

          /* ── Table row highlights (total / gross profit rows) ────────── */
          [class*="border-t-2"][class*="bg-purple-50"],
          [class*="border-t-2"][class*="bg-purple-500"] {
            background: #f5f3ff !important;
            border-top: 1.5pt solid #8B18E8 !important;
          }
          [class*="border-t-2"][class*="bg-emerald-50"],
          [class*="border-t-2"][class*="bg-emerald-500"] {
            background: #ecfdf5 !important;
            border-top: 1.5pt solid #10b981 !important;
          }
          [class*="border-t-2"][class*="bg-gray-50"],
          [class*="border-t-2"][class*="bg-white\\/\\["] {
            background: #f9fafb !important;
          }

          /* ── Table dividers ──────────────────────────────────────────── */
          [class*="divide-purple-"] > * + * { border-top: 0.3pt solid #ede9fe !important; }
          [class*="divide-white\\/"] > * + * { border-top: 0.3pt solid #f3f4f6 !important; }
          [class*="divide-gray-"]   > * + * { border-top: 0.3pt solid #f3f4f6 !important; }
          [class*="divide-red-"]    > * + * { border-top: 0.3pt solid #fee2e2 !important; }

          /* ── Statement-specific rows ─────────────────────────────────── */
          .border-t.border-purple-500\\/15 { border-top: 0.5pt solid #ddd6fe !important; }
          .bg-purple-500\\/10 { background: #f5f3ff !important; }
          .bg-emerald-500\\/10 { background: #ecfdf5 !important; }
          .bg-red-500\\/10 { background: #fff1f2 !important; }

          /* ── Cascade bars — inline styles print with color-adjust ─── */
          /* Already handled by print-color-adjust: exact above          */

          /* ── Gradient backgrounds ─────────────────────────────────────── */
          [class*="bg-hexa-gradient"] {
            background: linear-gradient(90deg, #E8177A, #8B18E8, #1B1BE8) !important;
          }

          /* ── Hover states — reset ────────────────────────────────────── */
          [class*="hover\\:bg-"] { background: transparent !important; }

          /* ── Insight/alert banners — saturated for print legibility ─── */
          .alert-critical { background: #fee2e2 !important; border: 0.6pt solid #f87171 !important; color: #991b1b !important; }
          .alert-warning  { background: #fef3c7 !important; border: 0.6pt solid #f59e0b !important; color: #78350f !important; }
          .alert-good     { background: #d1fae5 !important; border: 0.6pt solid #34d399 !important; color: #064e3b !important; }
          .alert-info     { background: #dbeafe !important; border: 0.6pt solid #60a5fa !important; color: #1e3a8a !important; }
          .alert-critical *, .alert-warning *, .alert-good *, .alert-info * { color: inherit !important; }

          /* Insight panel items */
          [class*="rounded-lg border p-3"],
          [class*="rounded-lg border p-4"] {
            padding: 4pt 6pt !important;
            margin-bottom: 3pt !important;
            border-width: 0.5pt !important;
          }

          /* ── Print header ────────────────────────────────────────────── */
          .hidden.print\\:block .border-b-2 {
            border-bottom: 2pt solid #8B18E8 !important;
            padding-bottom: 6pt !important;
            margin-bottom: 8pt !important;
          }

          /* ── Spacing reductions ──────────────────────────────────────── */
          .p-5, .p-6 { padding: 8pt !important; }
          .p-4        { padding: 6pt !important; }
          .mb-4, .mb-5, .mb-6 { margin-bottom: 6pt !important; }
          .gap-3, .gap-4 { gap: 6pt !important; }
          .space-y-3 > * + *, .space-y-2 > * + * { margin-top: 3pt !important; }

          /* ── Grid layouts ────────────────────────────────────────────── */
          .grid { display: grid !important; }
          .grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
          .lg\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
          .lg\\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; }
          .lg\\:col-span-2 { grid-column: span 2 !important; }

          /* ── Chart grids: single column + height cap ─────────────────── */
          .chart-grid {
            grid-template-columns: 1fr !important;
          }
          .chart-grid > * {
            grid-column: 1 !important;
          }
          .chart-grid canvas {
            max-height: 160pt !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="print:hidden flex flex-wrap items-start justify-between gap-4 bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-6 rounded-full bg-hexa-gradient" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Financial Statements</h1>
            </div>
            <p className="text-sm text-gray-500 ml-4">
              {periodLabel} · Consolidated in MYR · IAS 21 compliant
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {syncMsg && (
              <span className="text-xs text-gray-500 max-w-[220px] truncate">{syncMsg}</span>
            )}
            {!syncMsg && lastRefreshed && (
              <span className="text-xs text-gray-400">Updated {new Date(lastRefreshed).toLocaleTimeString()}</span>
            )}
            <button onClick={handleSync} disabled={syncing}
              title="Pull latest data from Zoho for AR Dashboard, Financial Statements and Executive Summary — all entities"
              className="btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
              <span className={syncing ? 'animate-spin inline-block' : ''}>↻</span>
              {syncing ? ' Syncing…' : ' Sync Now'}
            </button>
            <button onClick={() => setShowBoardReport((v) => !v)}
              className={showBoardReport ? 'btn-3d-secondary px-3 py-1.5 rounded-lg text-xs font-semibold' : 'px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-hexa-gradient'}>
              {showBoardReport ? '← Back to Statements' : '📋 Board Report'}
            </button>
            <button onClick={handlePrint}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-hexa-gradient">
              ⤓ Download PDF
            </button>
          </div>
        </div>

        {/* Period Selector */}
        <div className="print:hidden"><PeriodSelector period={period} onChange={handlePeriodChange} /></div>

        {showBoardReport ? (
          <BoardReportView period={period} />
        ) : (
        <>
        {/* Entity Selector */}
        <div className="flex flex-wrap gap-1.5 print:hidden">
          <button onClick={() => handleViewChange('consolidated')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              view === 'consolidated'
                ? 'bg-hexa-gradient text-white'
                : 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:text-white'
            }`}>
            Group Consolidated (MYR)
          </button>
          {ORGS.map((org, i) => (
            <button key={org.id} onClick={() => handleViewChange(org.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                view === org.id
                  ? 'text-white'
                  : 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:text-white'
              }`}
              style={view === org.id ? { backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] } : {}}>
              {org.short}
            </button>
          ))}
        </div>

        {/* Statement Tabs */}
        <div className="flex gap-1.5 p-1.5 bg-white/[0.06] rounded-xl print:hidden">
          {(['pl','bs','cf'] as TabType[]).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === t
                  ? 'bg-white/10 shadow-sm text-white border border-white/[0.10]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}>
              {t === 'pl' ? 'Profit & Loss' : t === 'bs' ? 'Balance Sheet' : 'Cash Flow'}
            </button>
          ))}
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-8">
          <div className="flex items-start justify-between border-b-2 border-hexa-purple pb-4 mb-4">
            <div>
              <p className="text-xs font-bold text-hexa-purple uppercase tracking-widest mb-1">Hexamatics Group</p>
              <h2 className="text-2xl font-bold text-white">
                {activeTab === 'pl' ? 'Profit & Loss Statement' : activeTab === 'bs' ? 'Balance Sheet' : 'Cash Flow Statement'}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {view === 'consolidated' ? 'Group Consolidated (MYR)' : ORGS.find((o) => o.id === view)?.name ?? view}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{periodLabel}</p>
              {compLabel && <p className="text-xs text-gray-500">Comparison: {compLabel}</p>}
              <p className="text-xs text-gray-500 mt-1">Generated {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>FX rates sourced from Bank Negara Malaysia · IAS 21 compliant · All amounts in MYR unless stated</span>
            <span className="font-semibold text-gray-300 uppercase tracking-wide">Confidential — Management Use Only</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-gray-400 text-sm font-medium">
                Fetching {activeTab === 'pl' ? 'P&L' : activeTab === 'bs' ? 'Balance Sheet' : 'Cash Flow'}
                {view === 'consolidated' ? ' — all entities' : ''}…
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && (
          <div className="space-y-6">
            {/* Per-entity error banner (consolidated view) */}
            {view === 'consolidated' && (() => {
              const errs = [
                ...(plConsolidated?.entities ?? []),
                ...(bsConsolidated?.entities ?? []),
                ...(cfConsolidated?.entities ?? []),
              ].filter((e) => e.error)
              if (!errs.length) return null
              const unique = [...new Map(errs.map((e) => [e.orgId, e])).values()]
              return (
                <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-400 space-y-1">
                  <p className="font-semibold">Some entities could not be loaded (excluded from consolidation):</p>
                  {unique.map((e) => (
                    <p key={e.orgId}>· <span className="font-medium">{e.orgShort}</span>: {e.error}</p>
                  ))}
                </div>
              )
            })()}

            {activeTab === 'pl' && (
              <>
                {view === 'consolidated' && plConsolidated && (
                  <ConsolidatedPLView data={plConsolidated} insights={insights} />
                )}
                {view !== 'consolidated' && plStatement && (
                  plStatement.error
                    ? <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-400 text-sm">{plStatement.error}</div>
                    : <PLView statement={plStatement} compLabel={compLabel} />
                )}
              </>
            )}

            {activeTab === 'bs' && (
              <>
                {view === 'consolidated' && bsConsolidated && (
                  <ConsolidatedBSView data={bsConsolidated} insights={insights} />
                )}
                {view !== 'consolidated' && bsStatement && (
                  bsStatement.error
                    ? <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-400 text-sm">{bsStatement.error}</div>
                    : <BSView statement={bsStatement} compLabel={compLabel} />
                )}
              </>
            )}

            {activeTab === 'cf' && (
              <>
                {view === 'consolidated' && cfConsolidated && (
                  <ConsolidatedCFView data={cfConsolidated} insights={insights} />
                )}
                {view !== 'consolidated' && cfStatement && (
                  cfStatement.error
                    ? <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-red-400 text-sm">{cfStatement.error}</div>
                    : <CFView statement={cfStatement} compLabel={compLabel} />
                )}
              </>
            )}

            {/* No data state */}
            {!loading && !error && !hasData && (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-medium text-gray-400">Select a period to load financial statements</p>
                <p className="text-sm mt-1">Data is fetched live from Zoho Books</p>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </>
  )
}
