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
  generatePLInsights, generateBSInsights, generateCFInsights,
  variance, varianceLabel, insightColor, insightIcon,
} from '@/lib/financial-analytics'
import { getFinancialPeriodLabel } from '@/lib/zoho-reports'
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
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="flex flex-wrap gap-2 items-center print:hidden">
      {/* Mode */}
      {(['month','quarter','half','year'] as const).map((m) => (
        <button key={m} onClick={() => onChange({ ...period, mode: m })}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            period.mode === m ? 'bg-hexa-purple text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}>
          {m === 'month' ? 'Month' : m === 'quarter' ? 'Quarter' : m === 'half' ? 'Half-Year' : 'Annual'}
        </button>
      ))}

      <div className="w-px h-5 bg-gray-700" />

      {/* Year */}
      <select value={period.year} onChange={(e) => onChange({ ...period, year: parseInt(e.target.value) })}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none">
        {years.map((y) => <option key={y}>{y}</option>)}
      </select>

      {/* Month selector */}
      {period.mode === 'month' && (
        <select value={period.month ?? now.getMonth() + 1}
          onChange={(e) => onChange({ ...period, month: parseInt(e.target.value) })}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none">
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      )}

      {/* Quarter selector */}
      {period.mode === 'quarter' && (
        <div className="flex gap-1">
          {([1,2,3,4] as const).map((q) => (
            <button key={q} onClick={() => onChange({ ...period, quarter: q })}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition ${
                period.quarter === q ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>Q{q}</button>
          ))}
        </div>
      )}

      {/* Half selector */}
      {period.mode === 'half' && (
        <div className="flex gap-1">
          {([1,2] as const).map((h) => (
            <button key={h} onClick={() => onChange({ ...period, half: h })}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition ${
                period.half === h ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>H{h}</button>
          ))}
        </div>
      )}

      <div className="w-px h-5 bg-gray-700" />

      {/* Comparison */}
      {(['previous','yoy','none'] as const).map((c) => (
        <button key={c} onClick={() => onChange({ ...period, comparison: c })}
          className={`px-2.5 py-1.5 rounded text-xs transition ${
            period.comparison === c ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}>
          {c === 'previous' ? 'vs Prior Period' : c === 'yoy' ? 'vs Last Year' : 'No Compare'}
        </button>
      ))}
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
    ? 'font-semibold text-white border-t border-gray-700'
    : hasSubs
    ? 'font-medium text-gray-200'
    : 'text-gray-400'

  return (
    <>
      <tr className={`${rowClass} hover:bg-gray-800/30 transition`}>
        <td className="py-1.5 pr-4" style={{ paddingLeft: `${indent * 16 + 12}px` }}>
          <div className="flex items-center gap-1.5">
            {hasSubs && (
              <button onClick={() => setOpen((o) => !o)}
                className="text-gray-600 hover:text-gray-400 text-xs w-4 flex-shrink-0">
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
        <td className={`py-1.5 text-right tabular-nums text-gray-600`}>
          {compMyr !== null ? fmtCurrency(isNegative ? -compMyr : compMyr, 'MYR') : '—'}
        </td>
        <td className={`py-1.5 text-right tabular-nums text-xs ${
          varPct !== null ? varColor(varPct, isNegative) : 'text-gray-600'
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
          <tr className="text-xs text-gray-500 border-b border-gray-800">
            <th className="text-left pb-2 pl-3 font-medium">Account</th>
            <th className="text-right pb-2 font-medium">Local Currency</th>
            <th className="text-right pb-2 font-medium">MYR (FX Adj.)</th>
            <th className="text-right pb-2 font-medium text-gray-600">{comparisonLabel ?? 'Prior Period'}</th>
            <th className="text-right pb-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">{children}</tbody>
      </table>
    </div>
  )
}

// ─── Section Header Row ───────────────────────────────────────────────────────

function SectionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={5} className="py-3 pl-3 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/40 border-b border-gray-800">
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
    <tr className={`font-bold border-t-2 ${highlight ? 'border-hexa-purple bg-gray-900/60' : 'border-gray-700 bg-gray-900/30'}`}>
      <td className="py-2 pl-3 text-white">{label}</td>
      <td className={`py-2 text-right tabular-nums ${amount < 0 ? 'text-red-400' : 'text-white'}`}>
        {fmtCurrency(isNegative ? -amount : amount, currency)}
      </td>
      <td className={`py-2 text-right tabular-nums ${myr < 0 ? 'text-red-400' : highlight ? 'text-purple-300' : 'text-gray-300'}`}>
        {fmtCurrency(isNegative ? -myr : myr, 'MYR')}
      </td>
      <td className="py-2 text-right tabular-nums text-gray-500">
        {compMyr !== undefined ? fmtCurrency(isNegative ? -compMyr : compMyr, 'MYR') : '—'}
      </td>
      <td className={`py-2 text-right tabular-nums text-sm ${
        varPct !== undefined ? varColor(varPct, isNegative) : 'text-gray-600'
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}{suffix}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${varColor(change)}`}>
          {varianceLabel(change)} vs prior
        </p>
      )}
    </div>
  )
}

// ─── Insights Panel ───────────────────────────────────────────────────────────

function InsightsPanel({ insights }: { insights: CFOInsight[] }) {
  if (!insights.length) return null
  return (
    <div className="space-y-2">
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
        <p className="text-xs text-gray-600">
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
        <p className="text-xs text-gray-600">
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
        <p className="text-xs text-gray-600">
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

  // Revenue mix donut chart
  const entityRevenues = entities.filter((e) => e.data.totalRevenue > 0)
  const donutData = {
    labels: entityRevenues.map((e) => e.orgShort),
    datasets: [{
      data: entityRevenues.map((e) => e.data.totalRevenue * e.fxRate),
      backgroundColor: entityRevenues.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]),
      borderWidth: 1,
      borderColor: '#111827',
    }],
  }

  // Entity profitability bar
  const profitEntities = entities.filter((e) => e.data.totalRevenue > 0)
  const barData = {
    labels: profitEntities.map((e) => e.orgShort),
    datasets: [
      {
        label: 'Revenue (MYR)',
        data: profitEntities.map((e) => e.data.totalRevenue * e.fxRate),
        backgroundColor: profitEntities.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length] + 'AA'),
      },
      {
        label: 'Net Profit (MYR)',
        data: profitEntities.map((e) => e.data.netProfit * e.fxRate),
        backgroundColor: profitEntities.map((e) =>
          e.data.netProfit >= 0 ? '#10B981AA' : '#EF4444AA'
        ),
      },
    ],
  }

  const chartOptions: any = {
    responsive: true,
    plugins: { legend: { labels: { color: '#9CA3AF', font: { size: 11 } } }, tooltip: { mode: 'index' } },
    scales: {
      x: { ticks: { color: '#6B7280' }, grid: { color: '#1F2937' } },
      y: { ticks: { color: '#6B7280' }, grid: { color: '#1F2937' } },
    },
  }

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Revenue & Profit by Entity (MYR)</h3>
          <Bar data={barData} options={chartOptions} height={220} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Revenue Mix</h3>
          <Doughnut data={donutData} options={{
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { size: 10 }, boxWidth: 12 } } },
          }} />
        </div>
      </div>

      {/* Group P&L Waterfall summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Consolidated P&L Summary (MYR)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="text-left pb-2">Metric</th>
              <th className="text-right pb-2">Amount (MYR)</th>
              <th className="text-right pb-2">Margin</th>
              <th className="text-right pb-2">Prior (MYR)</th>
              <th className="text-right pb-2">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {[
              { label: 'Total Revenue', value: g.totalRevenueMyr, margin: 100, comp: cg?.totalRevenueMyr },
              { label: 'Gross Profit', value: g.grossProfitMyr, margin: g.grossMarginPct, comp: cg?.grossProfitMyr },
              { label: 'EBITDA', value: g.ebitdaMyr, margin: g.ebitdaMarginPct, comp: cg?.ebitdaMyr },
              { label: 'EBIT', value: g.ebitMyr, margin: g.ebitMarginPct, comp: cg?.ebitMyr },
              { label: 'Net Profit', value: g.netProfitMyr, margin: g.netMarginPct, comp: cg?.netProfitMyr },
            ].map((row) => {
              const chg = row.comp ? variance(row.value, row.comp) : undefined
              return (
                <tr key={row.label} className="hover:bg-gray-800/30">
                  <td className="py-2 font-medium text-gray-200">{row.label}</td>
                  <td className={`py-2 text-right tabular-nums ${row.value < 0 ? 'text-red-400' : 'text-white'}`}>
                    {fmtCurrency(row.value)}
                  </td>
                  <td className="py-2 text-right text-gray-400 text-xs">{row.margin.toFixed(1)}%</td>
                  <td className="py-2 text-right text-gray-600 tabular-nums">
                    {row.comp ? fmtCurrency(row.comp) : '—'}
                  </td>
                  <td className={`py-2 text-right text-xs tabular-nums ${chg !== undefined ? varColor(chg) : 'text-gray-600'}`}>
                    {chg !== undefined ? varianceLabel(chg) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Entity breakdown table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Entity Breakdown</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left pb-2">Entity</th>
              <th className="text-right pb-2">Revenue (Local)</th>
              <th className="text-right pb-2">Revenue (MYR)</th>
              <th className="text-right pb-2">Gross Margin</th>
              <th className="text-right pb-2">EBITDA Margin</th>
              <th className="text-right pb-2">Net Margin</th>
              <th className="text-right pb-2">Net Profit (MYR)</th>
              <th className="text-right pb-2">Revenue Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {entities.map((e, i) => {
              const revMyr = e.data.totalRevenue * e.fxRate
              const share = g.totalRevenueMyr > 0 ? (revMyr / g.totalRevenueMyr) * 100 : 0
              return (
                <tr key={e.orgId} className="hover:bg-gray-800/30">
                  <td className="py-2 font-medium text-gray-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                    {e.orgShort}
                  </td>
                  <td className="py-2 text-right text-gray-400">
                    {e.error ? '—' : fmtCurrency(e.data.totalRevenue, e.currency)}
                  </td>
                  <td className="py-2 text-right text-gray-200">
                    {e.error ? <span className="text-red-400 text-xs">Error</span> : fmtCurrency(revMyr)}
                  </td>
                  <td className={`py-2 text-right ${e.data.grossMargin < 20 ? 'text-red-400' : 'text-gray-300'}`}>
                    {e.error ? '—' : fmtPct(e.data.grossMargin)}
                  </td>
                  <td className={`py-2 text-right ${e.data.ebitdaMargin < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                    {e.error ? '—' : fmtPct(e.data.ebitdaMargin)}
                  </td>
                  <td className={`py-2 text-right ${e.data.netMargin < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {e.error ? '—' : fmtPct(e.data.netMargin)}
                  </td>
                  <td className={`py-2 text-right ${e.data.netProfit * e.fxRate < 0 ? 'text-red-400' : 'text-white'}`}>
                    {e.error ? '—' : fmtCurrency(e.data.netProfit * e.fxRate)}
                  </td>
                  <td className="py-2 text-right text-gray-500">{fmtPct(share)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-300">Capital Structure</h3>
          <Doughnut
            data={{
              labels: ['Equity', 'Liabilities'],
              datasets: [{
                data: [Math.max(0, g.totalEquityMyr), g.totalLiabilitiesMyr],
                backgroundColor: ['#10B981AA','#EF4444AA'],
                borderColor: '#111827',
                borderWidth: 1,
              }],
            }}
            options={{ responsive: true, plugins: { legend: { labels: { color: '#9CA3AF' } } } }}
          />
          <div className="text-xs text-gray-500 text-center">D/E Ratio: {g.debtToEquity.toFixed(2)}x</div>
        </div>

        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Entity Balance Sheet Summary (MYR)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-2">Entity</th>
                <th className="text-right pb-2">Total Assets</th>
                <th className="text-right pb-2">Total Liab.</th>
                <th className="text-right pb-2">Equity</th>
                <th className="text-right pb-2">Current Ratio</th>
                <th className="text-right pb-2">D/E</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {entities.map((e) => (
                <tr key={e.orgId} className="hover:bg-gray-800/30">
                  <td className="py-2 font-medium text-gray-200">{e.orgShort}</td>
                  <td className="py-2 text-right">{e.error ? '—' : fmtCurrency(e.data.totalAssets * e.fxRate)}</td>
                  <td className="py-2 text-right">{e.error ? '—' : fmtCurrency(e.data.totalLiabilities * e.fxRate)}</td>
                  <td className={`py-2 text-right ${e.data.totalEquity < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {e.error ? '—' : fmtCurrency(e.data.totalEquity * e.fxRate)}
                  </td>
                  <td className={`py-2 text-right ${e.data.currentRatio < 1 ? 'text-red-400' : 'text-gray-300'}`}>
                    {e.error ? '—' : `${e.data.currentRatio.toFixed(2)}x`}
                  </td>
                  <td className={`py-2 text-right ${e.data.debtToEquity > 2 ? 'text-amber-400' : 'text-gray-300'}`}>
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

  const barData = {
    labels: entities.filter((e) => !e.error).map((e) => e.orgShort),
    datasets: [
      { label: 'Operating', data: entities.filter((e) => !e.error).map((e) => e.data.totalOperating * e.fxRate), backgroundColor: '#10B981AA' },
      { label: 'Investing', data: entities.filter((e) => !e.error).map((e) => e.data.totalInvesting * e.fxRate), backgroundColor: '#F59E0BAA' },
      { label: 'Financing', data: entities.filter((e) => !e.error).map((e) => e.data.totalFinancing * e.fxRate), backgroundColor: '#8B18E8AA' },
    ],
  }

  const chartOptions: any = {
    responsive: true,
    plugins: { legend: { labels: { color: '#9CA3AF', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#6B7280' }, grid: { color: '#1F2937' } },
      y: { ticks: { color: '#6B7280' }, grid: { color: '#1F2937' } },
    },
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Operating CF" value={fmtCurrency(g.totalOperatingMyr)} />
        <KpiCard label="Investing CF" value={fmtCurrency(g.totalInvestingMyr)} />
        <KpiCard label="Financing CF" value={fmtCurrency(g.totalFinancingMyr)} />
        <KpiCard label="Free Cash Flow" value={fmtCurrency(g.freeCashFlowMyr)} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Cash Flow by Entity (MYR)</h3>
        <Bar data={barData} options={chartOptions} height={200} />
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

  function buildParams(extra: Record<string, string> = {}): string {
    const sp = new URLSearchParams({
      mode: period.mode, year: String(period.year), comparison: period.comparison,
    })
    if (period.month) sp.set('month', String(period.month))
    if (period.quarter) sp.set('quarter', String(period.quarter))
    if (period.half) sp.set('half', String(period.half))
    if (view !== 'consolidated') sp.set('orgId', view)
    Object.entries(extra).forEach(([k, v]) => sp.set(k, v))
    return sp.toString()
  }

  const fetchData = useCallback(async (tab: TabType, force = false) => {
    setLoading(true)
    setError(null)
    try {
      const endpoint = tab === 'pl' ? 'pl' : tab === 'bs' ? 'bs' : 'cf'
      const params = buildParams(force ? { force: '1' } : {})
      const res = await fetch(`/api/financials/${endpoint}?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setLastRefreshed(json.lastRefreshed ?? new Date().toISOString())
      setInsights(json.insights ?? [])

      if (view === 'consolidated') {
        if (tab === 'pl') setPLConsolidated(json.consolidated)
        else if (tab === 'bs') setBSConsolidated(json.consolidated)
        else setCFConsolidated(json.consolidated)
      } else {
        if (tab === 'pl') setPLStatement(json.statement)
        else if (tab === 'bs') setBSStatement(json.statement)
        else setCFStatement(json.statement)
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load data')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, view])

  useEffect(() => {
    fetchData(activeTab)
  }, [fetchData, activeTab])

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

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .bg-gray-950, .bg-gray-900, .bg-gray-800 { background: white !important; border: 1px solid #e5e7eb !important; }
          .text-white, .text-gray-200, .text-gray-300, .text-gray-400 { color: black !important; }
          .text-gray-500, .text-gray-600 { color: #6B7280 !important; }
          .text-emerald-400 { color: #059669 !important; }
          .text-red-400 { color: #DC2626 !important; }
          .text-amber-400 { color: #D97706 !important; }
          .border-gray-700, .border-gray-800 { border-color: #e5e7eb !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Financial Statements</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {periodLabel} · Consolidated in MYR at BNM rates · IAS 21 compliant
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {lastRefreshed && (
              <span className="text-xs text-gray-600">
                Updated {new Date(lastRefreshed).toLocaleTimeString()}
              </span>
            )}
            <button onClick={() => fetchData(activeTab, true)}
              className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition">
              ↻ Refresh
            </button>
            <button onClick={handlePrint}
              className="px-3 py-1.5 rounded text-xs font-medium text-white bg-hexa-gradient hover:opacity-90 transition">
              ⤓ Download PDF
            </button>
          </div>
        </div>

        {/* Period Selector */}
        <PeriodSelector period={period} onChange={handlePeriodChange} />

        {/* Entity Selector */}
        <div className="flex flex-wrap gap-1.5 print:hidden">
          <button onClick={() => handleViewChange('consolidated')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              view === 'consolidated'
                ? 'bg-hexa-gradient text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            Group Consolidated (MYR)
          </button>
          {ORGS.map((org, i) => (
            <button key={org.id} onClick={() => handleViewChange(org.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                view === org.id
                  ? 'text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
              style={view === org.id ? { backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] } : {}}>
              {org.short}
            </button>
          ))}
        </div>

        {/* Statement Tabs */}
        <div className="flex gap-0 border-b border-gray-800 print:hidden">
          {([['pl','P&L Statement'],['bs','Balance Sheet'],['cf','Cash Flow']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h2 className="text-xl font-bold">{periodLabel} Financial Statements</h2>
          <p className="text-sm text-gray-500">
            Hexamatics Group · Generated {new Date().toLocaleDateString()} ·
            {view === 'consolidated' ? ' Group Consolidated (MYR)' : ` ${ORGS.find((o) => o.id === view)?.name}`}
          </p>
          <p className="text-xs text-gray-500">FX rates sourced from Bank Negara Malaysia · IAS 21 compliant</p>
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
              <p className="text-gray-500 text-sm">
                Fetching {activeTab === 'pl' ? 'P&L' : activeTab === 'bs' ? 'Balance Sheet' : 'Cash Flow'}
                {view === 'consolidated' ? ' for all 9 entities' : ''}…
              </p>
              {view === 'consolidated' && (
                <p className="text-xs text-gray-600 mt-1">
                  Also fetching BNM exchange rates for IAS 21 conversion
                </p>
              )}
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
              <div className="text-center py-20 text-gray-600">
                <p className="text-4xl mb-3">📊</p>
                <p className="font-medium text-gray-400">Select a period to load financial statements</p>
                <p className="text-sm mt-1">Data is fetched live from Zoho Books</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
