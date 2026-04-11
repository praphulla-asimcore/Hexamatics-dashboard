'use client'

import { useState, useCallback, useEffect } from 'react'
import type { DashboardData, PeriodDef } from '@/types'
import type { ConsolidatedPL, ConsolidatedBS, ConsolidatedCF, CFOInsight } from '@/types/financials'
import { fmtMyr, dsoColor } from '@/lib/format'
import { variance, varianceLabel, insightColor, insightIcon } from '@/lib/financial-analytics'
import { KpiCard } from './KpiCard'
import { NavBar } from './NavBar'
import { PeriodSelector } from './PeriodSelector'
import { HexaLogo } from './HexaLogo'

interface Props {
  initialData: DashboardData
  initialPeriod: PeriodDef
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  const abs = Math.abs(n)
  const neg = n < 0
  const s = abs >= 1_000_000
    ? `${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
    ? `${(abs / 1_000).toFixed(1)}K`
    : abs.toFixed(0)
  return `${neg ? '(' : ''}MYR ${s}${neg ? ')' : ''}`
}

function buildArParams(p: PeriodDef): URLSearchParams {
  const params = new URLSearchParams({
    mode: p.mode,
    year: String(p.year),
    comparison: p.comparison ?? 'previous',
  })
  if (p.month)   params.set('month',   String(p.month))
  if (p.quarter) params.set('quarter', String(p.quarter))
  if (p.half)    params.set('half',    String(p.half))
  return params
}

function buildFinParams(p: PeriodDef): URLSearchParams {
  const mode = (p.mode === 'ytd' || p.mode === 'rolling12') ? 'year' : p.mode
  const params = new URLSearchParams({
    mode,
    year: String(p.year),
    comparison: p.comparison ?? 'previous',
  })
  if (p.month   && mode === 'month')   params.set('month',   String(p.month))
  if (p.quarter && mode === 'quarter') params.set('quarter', String(p.quarter))
  if (p.half    && mode === 'half')    params.set('half',    String(p.half))
  return params
}

function varClass(v: number, inverse = false): string {
  if (v === 0) return 'text-gray-500'
  return (inverse ? v < 0 : v > 0) ? 'text-emerald-400' : 'text-red-400'
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6 print:mb-4 print:break-inside-avoid print:rounded-none print:border-gray-300">
      <div className="px-6 py-3.5 border-b border-gray-800 bg-gray-800/40 print:border-gray-300 print:bg-gray-100 print:px-4 print:py-2">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider print:text-gray-900 print:text-xs">{title}</h2>
      </div>
      <div className="p-6 print:p-4 print:bg-white">{children}</div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ExecutiveSummaryClient({ initialData, initialPeriod }: Props) {
  const [data, setData]   = useState<DashboardData>(initialData)
  const [period, setPeriod] = useState<PeriodDef>(initialPeriod)
  const [loading, setLoading] = useState(false)
  const [plData, setPlData] = useState<{ consolidated: ConsolidatedPL; insights: CFOInsight[] } | null>(null)
  const [bsData, setBsData] = useState<{ consolidated: ConsolidatedBS; insights: CFOInsight[] } | null>(null)
  const [cfData, setCfData] = useState<{ consolidated: ConsolidatedCF; insights: CFOInsight[] } | null>(null)

  const fetchAll = useCallback(async (p: PeriodDef) => {
    setLoading(true)
    try {
      const arP  = buildArParams(p)
      const finP = buildFinParams(p)

      // Fetch AR data immediately (separate Zoho service, no rate limit conflict)
      const arRes  = await fetch(`/api/zoho/dashboard?${arP}`)
      const arJson = await arRes.json()
      if (!arJson.error) setData(arJson)

      // Fetch financials sequentially to avoid Zoho 429 rate limits
      // Each type fetches 9 orgs one-by-one; running them in parallel would
      // triple the concurrent request count and reliably trigger throttling.
      const plRes  = await fetch(`/api/financials/pl?${finP}`)
      const plJson = await plRes.json()
      if (plJson.consolidated) setPlData(plJson)

      const bsRes  = await fetch(`/api/financials/bs?${finP}`)
      const bsJson = await bsRes.json()
      if (bsJson.consolidated) setBsData(bsJson)

      const cfRes  = await fetch(`/api/financials/cf?${finP}`)
      const cfJson = await cfRes.json()
      if (cfJson.consolidated) setCfData(cfJson)
    } catch (err) {
      console.error('Executive summary fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePeriodChange = useCallback((p: PeriodDef) => {
    setPeriod(p)
    fetchAll(p)
  }, [fetchAll])

  useEffect(() => { fetchAll(initialPeriod) }, [])

  // ─── Derived metrics ─────────────────────────────────────────────────────

  const pl = plData?.consolidated
  const bs = bsData?.consolidated
  const cf = cfData?.consolidated

  const allInsights: CFOInsight[] = [
    ...(plData?.insights ?? []),
    ...(bsData?.insights ?? []),
    ...(cfData?.insights ?? []),
  ]

  const collectionRate = data.group.collectionRate
  const totalRevenueMyr = data.group.totalMyr

  const weightedDso = data.entities.length > 0
    ? data.entities.reduce((s, e) => s + e.ratios.dso * e.period.totalMyr, 0)
      / (data.entities.reduce((s, e) => s + e.period.totalMyr, 0) || 1)
    : 0

  const cashBalanceMyr = cf
    ? cf.entities.filter(e => !e.error).reduce((s, e) => s + e.data.closingBalance * e.fxRate, 0)
    : 0

  const agingMyr = {
    current: data.entities.reduce((s, e) => s + e.arAging.current     * e.org.fxToMyr, 0),
    d1_30:   data.entities.reduce((s, e) => s + e.arAging.days1to30   * e.org.fxToMyr, 0),
    d31_60:  data.entities.reduce((s, e) => s + e.arAging.days31to60  * e.org.fxToMyr, 0),
    d61_90:  data.entities.reduce((s, e) => s + e.arAging.days61to90  * e.org.fxToMyr, 0),
    d90plus: data.entities.reduce((s, e) => s + e.arAging.days90plus  * e.org.fxToMyr, 0),
  }
  const totalAgingMyr = Object.values(agingMyr).reduce((a, b) => a + b, 0)

  const revenueSource  = pl ? pl.group.totalRevenueMyr : totalRevenueMyr
  const prevRevenue    = pl?.comparison?.group.totalRevenueMyr
  const revenueGrowth  = (prevRevenue && prevRevenue > 0) ? variance(revenueSource, prevRevenue) : null

  // ─── Alerts ──────────────────────────────────────────────────────────────

  const alerts: { level: 'critical' | 'warning'; message: string; detail: string }[] = []

  data.entities.forEach(e => {
    const aging90pct = totalAgingMyr > 0
      ? (e.arAging.days90plus * e.org.fxToMyr / totalAgingMyr) * 100 : 0
    if (aging90pct > 25 && e.period.totalMyr > 5000) {
      alerts.push({ level: 'critical', message: `${e.org.short}: High 90+ day AR`, detail: `${aging90pct.toFixed(1)}% of AR overdue >90 days — immediate follow-up required` })
    }
    const cRate = e.period.total > 0 ? (e.period.collected / e.period.total) * 100 : 100
    if (cRate < 70 && e.period.totalMyr > 10000) {
      alerts.push({ level: 'critical', message: `${e.org.short}: Low collection rate`, detail: `${cRate.toFixed(1)}% — significantly below 70% threshold` })
    }
    if (e.ratios.dso > 75 && e.period.totalMyr > 10000) {
      alerts.push({ level: 'warning', message: `${e.org.short}: High DSO (${e.ratios.dso.toFixed(0)} days)`, detail: 'Days Sales Outstanding exceeds 75 days — review collections policy' })
    }
  })

  if (pl && pl.group.ebitdaMyr < 0) {
    alerts.push({ level: 'critical', message: 'Negative Group EBITDA', detail: `${fmtM(pl.group.ebitdaMyr)} — operating expenses exceed gross profit` })
  }
  if (pl && pl.group.netMarginPct < -5) {
    alerts.push({ level: 'critical', message: 'Significant Net Loss', detail: `Net margin ${pl.group.netMarginPct.toFixed(1)}% — sustained losses erode equity` })
  }
  if (bs && bs.group.currentRatio < 1.0) {
    alerts.push({ level: 'critical', message: 'Liquidity Risk', detail: `Current ratio ${bs.group.currentRatio.toFixed(2)}x — current liabilities exceed current assets` })
  }
  if (cf && cf.group.totalOperatingMyr < 0) {
    alerts.push({ level: 'warning', message: 'Negative Operating Cash Flow', detail: `${fmtM(cf.group.totalOperatingMyr)} cash consumed from operations` })
  }

  // ─── Monthly trend for forecast ──────────────────────────────────────────

  const monthlyGrouped: Record<string, number> = {}
  data.entities.forEach(e =>
    e.monthlyTrend.forEach(m => {
      const key = `${m.year}-${String(m.month).padStart(2, '0')}`
      monthlyGrouped[key] = (monthlyGrouped[key] ?? 0) + m.totalMyr
    })
  )
  const sortedMonths = Object.entries(monthlyGrouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 print:bg-white">
      <NavBar />

      {/* ── Print Header ─────────────────────────────────────────────────── */}
      <div className="hidden print:flex items-center justify-between px-8 py-5 border-b-2 border-gray-200 mb-6">
        <HexaLogo className="h-9" />
        <div className="text-center">
          <p className="text-base font-bold text-gray-900 tracking-wide">GROUP EXECUTIVE SUMMARY</p>
          <p className="text-xs text-gray-600 mt-0.5">{data.periodLabel}</p>
          {data.dateRange.from && (
            <p className="text-[10px] text-gray-400">{data.dateRange.from} — {data.dateRange.to}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400">Generated {new Date().toLocaleDateString('en-MY', { dateStyle: 'long' })}</p>
          <p className="text-[10px] text-gray-400 italic mt-0.5">Confidential — Management Use Only</p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 print:py-2 print:px-6">

        {/* ── Screen Header ────────────────────────────────────────────────── */}
        <div className="mb-8 print:hidden">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Executive Summary</h1>
              <p className="text-gray-400 text-sm">
                {data.periodLabel}
                {data.comparisonLabel && ` · vs ${data.comparisonLabel}`}
              </p>
              {data.dateRange.from && (
                <p className="text-gray-500 text-xs mt-0.5">{data.dateRange.from} → {data.dateRange.to}</p>
              )}
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition"
            >
              <span>⎙</span> Print / Export PDF
            </button>
          </div>
          <PeriodSelector value={period} onChange={handlePeriodChange} loading={loading} />
        </div>

        {/* ── 1. Headline KPIs ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 print:grid-cols-6 print:gap-2 print:mb-4">
          <KpiCard
            label="Group Revenue"
            value={fmtM(revenueSource)}
            highlight
            sub={revenueGrowth !== null ? `${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% vs prior` : undefined}
            trend={revenueGrowth !== null ? (revenueGrowth >= 0 ? 'up' : 'down') : undefined}
          />
          <KpiCard
            label="Gross Profit"
            value={pl ? fmtM(pl.group.grossProfitMyr) : '—'}
            sub={pl ? `${pl.group.grossMarginPct.toFixed(1)}% margin` : undefined}
            trend={pl ? (pl.group.grossMarginPct >= 20 ? 'up' : 'warn') : undefined}
          />
          <KpiCard
            label="EBITDA"
            value={pl ? fmtM(pl.group.ebitdaMyr) : '—'}
            sub={pl ? `${pl.group.ebitdaMarginPct.toFixed(1)}% margin` : undefined}
            trend={pl ? (pl.group.ebitdaMyr >= 0 ? 'up' : 'down') : undefined}
          />
          <KpiCard
            label="Net Profit"
            value={pl ? fmtM(pl.group.netProfitMyr) : '—'}
            sub={pl ? `${pl.group.netMarginPct.toFixed(1)}% margin` : undefined}
            trend={pl ? (pl.group.netProfitMyr >= 0 ? 'up' : 'down') : undefined}
          />
          <KpiCard
            label="Cash Balance"
            value={cashBalanceMyr ? fmtM(cashBalanceMyr) : '—'}
            sub={cf ? `FCF: ${fmtM(cf.group.freeCashFlowMyr)}` : undefined}
            trend={cf ? (cf.group.freeCashFlowMyr >= 0 ? 'up' : 'warn') : undefined}
          />
          <KpiCard
            label="Collection Rate"
            value={`${collectionRate.toFixed(1)}%`}
            sub={`DSO: ${weightedDso.toFixed(0)} days`}
            trend={collectionRate >= 85 ? 'up' : collectionRate >= 70 ? 'warn' : 'down'}
          />
        </div>

        {/* ── 2. Revenue & Profitability ───────────────────────────────────── */}
        <Section title="Revenue & Profitability Overview">
          {pl ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm print:text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs print:border-gray-300 print:text-gray-600">
                    <th className="text-left py-2.5 pr-6 font-medium">Metric</th>
                    <th className="text-right py-2.5 pr-6 font-medium">Current Period</th>
                    <th className="text-right py-2.5 pr-6 font-medium">% of Revenue</th>
                    {pl.comparison && <th className="text-right py-2.5 pr-6 font-medium">Prior Period</th>}
                    {pl.comparison && <th className="text-right py-2.5 font-medium">Change</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50 print:divide-gray-200">
                  {[
                    { label: 'Revenue',            cur: pl.group.totalRevenueMyr,  prev: pl.comparison?.group.totalRevenueMyr,  pct: 100,                           bold: false },
                    { label: 'Cost of Sales',       cur: -pl.group.totalCogsMyr,   prev: pl.comparison ? -pl.comparison.group.totalCogsMyr  : undefined, pct: pl.group.totalRevenueMyr > 0 ? -(pl.group.totalCogsMyr  / pl.group.totalRevenueMyr) * 100 : 0, bold: false },
                    { label: 'Gross Profit',        cur: pl.group.grossProfitMyr,  prev: pl.comparison?.group.grossProfitMyr,  pct: pl.group.grossMarginPct,       bold: true  },
                    { label: 'Operating Expenses',  cur: -pl.group.totalOpexMyr,   prev: pl.comparison ? -pl.comparison.group.totalOpexMyr   : undefined, pct: pl.group.totalRevenueMyr > 0 ? -(pl.group.totalOpexMyr   / pl.group.totalRevenueMyr) * 100 : 0, bold: false },
                    { label: 'EBITDA',              cur: pl.group.ebitdaMyr,       prev: pl.comparison?.group.ebitdaMyr,       pct: pl.group.ebitdaMarginPct,      bold: true  },
                    { label: 'EBIT',                cur: pl.group.ebitMyr,         prev: pl.comparison?.group.ebitMyr,         pct: pl.group.ebitMarginPct,        bold: false },
                    { label: 'Net Profit',          cur: pl.group.netProfitMyr,    prev: pl.comparison?.group.netProfitMyr,    pct: pl.group.netMarginPct,      bold: true  },
                  ].map(row => {
                    const chg = (row.prev !== undefined && row.prev !== 0)
                      ? variance(row.cur, row.prev) : null
                    return (
                      <tr key={row.label} className={row.bold ? 'font-semibold text-white print:text-gray-900' : 'text-gray-400 print:text-gray-600'}>
                        <td className="py-2.5 pr-6 pl-2">{row.label}</td>
                        <td className={`py-2.5 pr-6 text-right tabular-nums ${row.cur < 0 ? 'text-red-400' : row.bold ? 'text-white print:text-gray-900' : 'text-gray-300 print:text-gray-700'}`}>
                          {fmtM(row.cur)}
                        </td>
                        <td className={`py-2.5 pr-6 text-right tabular-nums text-xs ${row.pct < 0 ? 'text-red-400' : 'text-gray-500 print:text-gray-500'}`}>
                          {row.pct !== 100 ? `${row.pct.toFixed(1)}%` : '—'}
                        </td>
                        {pl.comparison && (
                          <td className="py-2.5 pr-6 text-right tabular-nums text-gray-500 print:text-gray-500 text-xs">
                            {row.prev !== undefined ? fmtM(row.prev) : '—'}
                          </td>
                        )}
                        {pl.comparison && (
                          <td className={`py-2.5 text-right tabular-nums text-xs font-semibold ${chg !== null ? varClass(chg) : 'text-gray-600'}`}>
                            {chg !== null ? varianceLabel(chg) : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-500 text-sm">
              {loading ? 'Loading financial data…' : 'P&L data unavailable for this period.'}
            </p>
          )}
        </Section>

        {/* ── 3. Budget vs Actual ──────────────────────────────────────────── */}
        <Section title="Budget vs Actual — Period Comparison">
          {pl?.comparison ? (
            <>
              <p className="text-xs text-gray-500 mb-5 print:text-gray-600">
                <span className="text-gray-300 font-medium print:text-gray-800">{data.periodLabel}</span> compared to{' '}
                <span className="text-gray-300 font-medium print:text-gray-800">{data.comparisonLabel || 'prior period'}</span>.
                {' '}Budget-to-actual requires budget data in Zoho Books; period-over-period variance shown.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-3">
                {[
                  { label: 'Revenue',           cur: pl.group.totalRevenueMyr,  prev: pl.comparison.group.totalRevenueMyr  },
                  { label: 'Gross Profit',      cur: pl.group.grossProfitMyr,   prev: pl.comparison.group.grossProfitMyr   },
                  { label: 'EBITDA',            cur: pl.group.ebitdaMyr,        prev: pl.comparison.group.ebitdaMyr        },
                  { label: 'Net Profit',        cur: pl.group.netProfitMyr,     prev: pl.comparison.group.netProfitMyr     },
                  { label: 'Operating Expenses',cur: pl.group.totalOpexMyr,     prev: pl.comparison.group.totalOpexMyr,    inverse: true },
                  { label: 'Cost of Sales',     cur: pl.group.totalCogsMyr,     prev: pl.comparison.group.totalCogsMyr,    inverse: true },
                  { label: 'Gross Margin',      cur: pl.group.grossMarginPct,   prev: pl.comparison.group.grossMarginPct,  isPct: true },
                  { label: 'Net Margin',        cur: pl.group.netMarginPct,  prev: pl.comparison.group.netMarginPct, isPct: true },
                ].map(item => {
                  const chg = item.prev !== 0 ? variance(item.cur, item.prev) : null
                  const favorable = chg !== null && (item.inverse ? chg < 0 : chg > 0)
                  return (
                    <div key={item.label} className="bg-gray-800/50 rounded-lg p-4 print:p-2 print:bg-gray-50 print:border print:border-gray-200">
                      <p className="text-xs text-gray-400 print:text-gray-600 mb-2">{item.label}</p>
                      <p className="text-xl font-bold text-white print:text-gray-900 print:text-lg">
                        {item.isPct ? `${item.cur.toFixed(1)}%` : fmtM(item.cur)}
                      </p>
                      <p className="text-xs text-gray-500 print:text-gray-500 mt-1">
                        Prior: {item.isPct ? `${item.prev.toFixed(1)}%` : fmtM(item.prev)}
                      </p>
                      {chg !== null && (
                        <p className={`text-xs font-bold mt-1.5 ${favorable ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'}`}>
                          {varianceLabel(chg)} {favorable ? '▲' : '▼'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm py-4">
              {loading ? 'Loading…' : 'Select a comparison mode in the period selector to see variance analysis.'}
            </p>
          )}
        </Section>

        {/* ── 4. Cash & Liquidity ──────────────────────────────────────────── */}
        <Section title="Cash & Liquidity Position">
          {cf ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
              {[
                { label: 'Closing Cash Balance',    val: cashBalanceMyr,                   desc: 'Group aggregate — MYR equivalent' },
                { label: 'Operating Cash Flow',      val: cf.group.totalOperatingMyr,       desc: 'Cash generated from core operations' },
                { label: 'Free Cash Flow',           val: cf.group.freeCashFlowMyr,         desc: 'Operating CF minus capital expenditure' },
                { label: 'Investing Activities',     val: cf.group.totalInvestingMyr,       desc: 'Capex & investment outflows' },
                { label: 'Financing Activities',     val: cf.group.totalFinancingMyr,       desc: 'Debt & equity cash movements' },
                { label: 'Net Cash Change',          val: cf.group.netCashChangeMyr,        desc: 'Period net increase / (decrease) in cash' },
              ].map(item => (
                <div key={item.label} className="bg-gray-800/40 rounded-xl p-4 print:p-3 print:bg-gray-50 print:border print:border-gray-200">
                  <p className="text-xs text-gray-400 print:text-gray-600 mb-2">{item.label}</p>
                  <p className={`text-xl font-bold print:text-base ${item.val < 0 ? 'text-red-400 print:text-red-700' : item.val > 0 ? 'text-white print:text-gray-900' : 'text-gray-500'}`}>
                    {fmtM(item.val)}
                  </p>
                  <p className="text-[11px] text-gray-600 print:text-gray-500 mt-1.5">{item.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4">{loading ? 'Loading…' : 'Cash flow data unavailable for this period.'}</p>
          )}
        </Section>

        {/* ── 5. Working Capital & Receivables ────────────────────────────── */}
        <Section title="Working Capital & Receivables Metrics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-6">

            {/* AR metrics */}
            <div>
              <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-3">Accounts Receivable</p>
              <div className="space-y-2 print:space-y-1.5">
                {[
                  { label: 'Total AR Outstanding',     value: fmtMyr(data.group.outstandingMyr) },
                  { label: 'Total Revenue Billed',     value: fmtMyr(data.group.totalMyr) },
                  { label: 'Weighted DSO',             value: `${weightedDso.toFixed(0)} days`,       cls: dsoColor(weightedDso) },
                  { label: 'Group Collection Rate',    value: `${collectionRate.toFixed(1)}%`,          cls: collectionRate >= 85 ? 'text-emerald-400' : collectionRate >= 70 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Active Entities',          value: `${data.entities.length}` },
                  { label: 'Total Invoices',           value: `${data.group.invoiceCount.toLocaleString()}` },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center py-2 border-b border-gray-800/60 print:border-gray-200">
                    <span className="text-sm text-gray-400 print:text-gray-600">{r.label}</span>
                    <span className={`text-sm font-semibold ${r.cls ?? 'text-white print:text-gray-900'}`}>{r.value}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mt-6 mb-3">AR Aging Breakdown</p>
              {totalAgingMyr > 0 ? (
                <div className="space-y-2.5">
                  {[
                    { label: 'Current (not yet due)', val: agingMyr.current, bar: 'bg-emerald-500', print: 'print:bg-emerald-600' },
                    { label: '1–30 days overdue',     val: agingMyr.d1_30,   bar: 'bg-amber-400',   print: 'print:bg-amber-500'  },
                    { label: '31–60 days overdue',    val: agingMyr.d31_60,  bar: 'bg-orange-500',  print: 'print:bg-orange-600' },
                    { label: '61–90 days overdue',    val: agingMyr.d61_90,  bar: 'bg-red-500',     print: 'print:bg-red-600'    },
                    { label: '90+ days overdue',      val: agingMyr.d90plus, bar: 'bg-red-800',     print: 'print:bg-red-900'    },
                  ].map(row => {
                    const pct = totalAgingMyr > 0 ? (row.val / totalAgingMyr) * 100 : 0
                    return (
                      <div key={row.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400 print:text-gray-600">{row.label}</span>
                          <span className="text-gray-300 print:text-gray-700 tabular-nums">{fmtMyr(row.val)} <span className="text-gray-500">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-gray-800 print:bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-600 text-xs">No aging data available.</p>
              )}
            </div>

            {/* Balance Sheet working capital */}
            <div>
              <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-3">Balance Sheet Highlights</p>
              {bs ? (
                <div className="space-y-2 print:space-y-1.5">
                  {[
                    { label: 'Working Capital',    value: fmtM(bs.group.workingCapitalMyr), cls: bs.group.workingCapitalMyr >= 0 ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700' },
                    { label: 'Current Ratio',      value: `${bs.group.currentRatio.toFixed(2)}x`,  cls: bs.group.currentRatio >= 1.5 ? 'text-emerald-400 print:text-emerald-700' : bs.group.currentRatio >= 1.0 ? 'text-amber-400 print:text-amber-700' : 'text-red-400 print:text-red-700' },
                    { label: 'Debt-to-Equity',     value: `${bs.group.debtToEquity.toFixed(2)}x`,  cls: bs.group.debtToEquity <= 1 ? 'text-emerald-400 print:text-emerald-700' : bs.group.debtToEquity <= 2 ? 'text-amber-400 print:text-amber-700' : 'text-red-400 print:text-red-700' },
                    { label: 'Total Assets',       value: fmtM(bs.group.totalAssetsMyr) },
                    { label: 'Total Liabilities',  value: fmtM(bs.group.totalLiabilitiesMyr) },
                    { label: 'Total Equity',       value: fmtM(bs.group.totalEquityMyr), cls: bs.group.totalEquityMyr >= 0 ? 'text-white print:text-gray-900' : 'text-red-400 print:text-red-700' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between items-center py-2 border-b border-gray-800/60 print:border-gray-200">
                      <span className="text-sm text-gray-400 print:text-gray-600">{r.label}</span>
                      <span className={`text-sm font-semibold ${r.cls ?? 'text-white print:text-gray-900'}`}>{r.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm py-4">{loading ? 'Loading…' : 'Balance sheet data unavailable.'}</p>
              )}

              {/* DPO note */}
              <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mt-6 mb-3">Payables</p>
              <p className="text-xs text-gray-600 print:text-gray-500 italic">
                Accounts Payable (DPO) data requires Zoho Books Bills module integration.
              </p>
            </div>
          </div>
        </Section>

        {/* ── 6. Cost Structure ────────────────────────────────────────────── */}
        <Section title="Cost Structure Overview">
          {pl ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-4">Group Cost Breakdown</p>
                <div className="space-y-4 print:space-y-3">
                  {[
                    { label: 'Cost of Sales (COGS)', val: pl.group.totalCogsMyr,  color: 'bg-hexa-pink' },
                    { label: 'Operating Expenses',   val: pl.group.totalOpexMyr,   color: 'bg-hexa-purple' },
                  ].map(r => {
                    const pct = pl.group.totalRevenueMyr > 0 ? (r.val / pl.group.totalRevenueMyr) * 100 : 0
                    return (
                      <div key={r.label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm text-gray-300 print:text-gray-700">{r.label}</span>
                          <span className="text-sm font-semibold text-white print:text-gray-900">{fmtM(r.val)}</span>
                        </div>
                        <div className="h-2 bg-gray-800 print:bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 print:text-gray-500 mt-1 text-right">{pct.toFixed(1)}% of revenue</p>
                      </div>
                    )
                  })}
                  <div className="pt-3 border-t border-gray-700 print:border-gray-300">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-white print:text-gray-900">Total Cost-to-Revenue</span>
                      <span className="text-sm font-bold text-white print:text-gray-900">
                        {pl.group.totalRevenueMyr > 0
                          ? `${(((pl.group.totalCogsMyr + pl.group.totalOpexMyr) / pl.group.totalRevenueMyr) * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-4">Opex by Entity</p>
                {pl.entities.filter(e => !e.error && e.data.totalOpex > 0).length > 0 ? (
                  <div className="space-y-2.5">
                    {pl.entities
                      .filter(e => !e.error)
                      .sort((a, b) => (b.data.totalOpex * b.fxRate) - (a.data.totalOpex * a.fxRate))
                      .map(e => {
                        const opexMyr = e.data.totalOpex * e.fxRate
                        const maxOpex = Math.max(...pl.entities.filter(x => !x.error).map(x => x.data.totalOpex * x.fxRate))
                        const pct = maxOpex > 0 ? (opexMyr / maxOpex) * 100 : 0
                        return (
                          <div key={e.orgId} className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 print:text-gray-600 w-28 flex-shrink-0 truncate">{e.orgShort}</span>
                            <div className="flex-1 h-1.5 bg-gray-800 print:bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-hexa-purple/70 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-300 print:text-gray-700 tabular-nums w-24 text-right">{fmtM(opexMyr)}</span>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">No entity opex data available.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4">{loading ? 'Loading…' : 'Cost data unavailable.'}</p>
          )}
        </Section>

        {/* ── 7. Geographic / Entity Performance ──────────────────────────── */}
        <Section title="Geographic & Entity Performance">
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-xs">
              <thead>
                <tr className="border-b border-gray-700 print:border-gray-300 text-gray-400 print:text-gray-600 text-xs">
                  <th className="text-left py-3 pr-4 font-medium">Entity</th>
                  <th className="text-left py-3 pr-4 font-medium">Country</th>
                  <th className="text-right py-3 pr-4 font-medium">Revenue (MYR)</th>
                  <th className="text-right py-3 pr-4 font-medium">Collection %</th>
                  <th className="text-right py-3 pr-4 font-medium">DSO</th>
                  <th className="text-right py-3 pr-4 font-medium">AR 90+</th>
                  {pl && <th className="text-right py-3 pr-4 font-medium">Net Margin</th>}
                  {pl && <th className="text-right py-3 font-medium">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50 print:divide-gray-200">
                {data.entities.map(e => {
                  const cRate     = e.period.total > 0 ? (e.period.collected / e.period.total) * 100 : 0
                  const aging90pct = e.period.totalMyr > 0 ? (e.arAging.days90plus * e.org.fxToMyr / e.period.totalMyr) * 100 : 0
                  const plEntity  = pl?.entities.find(p => p.orgId === e.org.id)
                  const hasIssue  = cRate < 70 || e.ratios.dso > 75 || aging90pct > 20 || (plEntity && plEntity.data.netMargin < -5)
                  const isGood    = cRate >= 90 && e.ratios.dso <= 30 && aging90pct < 5

                  return (
                    <tr key={e.org.id} className={`transition ${hasIssue ? 'bg-red-950/10 print:bg-red-50' : 'hover:bg-gray-800/20'}`}>
                      <td className="py-3 pr-4 font-medium text-white print:text-gray-900 print:py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasIssue ? 'bg-red-500' : isGood ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                          {e.org.short}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 print:text-gray-600 print:py-2">{e.org.country}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-300 print:text-gray-700 print:py-2">{fmtMyr(e.period.totalMyr)}</td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold print:py-2 ${cRate >= 85 ? 'text-emerald-400 print:text-emerald-700' : cRate >= 70 ? 'text-amber-400 print:text-amber-700' : 'text-red-400 print:text-red-700'}`}>
                        {cRate.toFixed(1)}%
                      </td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold print:py-2 ${dsoColor(e.ratios.dso)}`}>
                        {e.ratios.dso.toFixed(0)}d
                      </td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold print:py-2 ${aging90pct >= 20 ? 'text-red-400 print:text-red-700' : aging90pct >= 10 ? 'text-amber-400 print:text-amber-700' : 'text-emerald-400 print:text-emerald-700'}`}>
                        {aging90pct.toFixed(1)}%
                      </td>
                      {pl && (
                        <td className={`py-3 pr-4 text-right tabular-nums font-semibold print:py-2 ${plEntity && !plEntity.error ? (plEntity.data.netMargin >= 5 ? 'text-emerald-400 print:text-emerald-700' : plEntity.data.netMargin >= 0 ? 'text-amber-400 print:text-amber-700' : 'text-red-400 print:text-red-700') : 'text-gray-600'}`}>
                          {plEntity && !plEntity.error ? `${plEntity.data.netMargin.toFixed(1)}%` : '—'}
                        </td>
                      )}
                      {pl && (
                        <td className="py-3 text-right print:py-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${hasIssue ? 'bg-red-950/50 text-red-300 print:bg-red-100 print:text-red-700' : isGood ? 'bg-emerald-950/50 text-emerald-300 print:bg-emerald-100 print:text-emerald-700' : 'bg-amber-950/50 text-amber-300 print:bg-amber-100 print:text-amber-700'}`}>
                            {hasIssue ? 'Review' : isGood ? 'On Track' : 'Monitor'}
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 8. Key Alerts ────────────────────────────────────────────────── */}
        <Section title="Key Alerts & Exceptions">
          {alerts.length > 0 ? (
            <div className="space-y-2.5 print:space-y-2">
              {alerts
                .sort((a, b) => (a.level === 'critical' ? -1 : 1) - (b.level === 'critical' ? -1 : 1))
                .map((alert, i) => (
                  <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border print:p-2.5 print:rounded-md ${
                    alert.level === 'critical'
                      ? 'bg-red-950/30 border-red-900/60 text-red-300 print:bg-red-50 print:border-red-300 print:text-red-800'
                      : 'bg-amber-950/30 border-amber-900/60 text-amber-300 print:bg-amber-50 print:border-amber-300 print:text-amber-800'
                  }`}>
                    <span className="text-xl flex-shrink-0 print:text-sm mt-0.5">{alert.level === 'critical' ? '⚠' : '◆'}</span>
                    <div>
                      <p className="text-sm font-semibold">{alert.message}</p>
                      <p className="text-xs opacity-75 mt-0.5">{alert.detail}</p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-emerald-400 print:text-emerald-700 py-2">
              <span className="text-2xl print:text-lg">✓</span>
              <p className="text-sm font-semibold">No critical alerts detected for this period. All key metrics within acceptable thresholds.</p>
            </div>
          )}
        </Section>

        {/* ── 9. Forecast & Outlook ────────────────────────────────────────── */}
        <Section title="Forecast & Outlook — Next 3–6 Months">
          <p className="text-xs text-gray-500 print:text-gray-600 mb-5">
            Revenue projections based on trailing 6-month trend from AR data. Indicative only — actual results may vary based on pipeline, market conditions, and collections.
          </p>
          {sortedMonths.length >= 3 ? (
            <>
              <div className="mb-6 print:mb-4">
                <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-3">Trailing 6-Month Revenue Actuals</p>
                <div className="overflow-x-auto">
                  <table className="text-sm print:text-xs">
                    <thead>
                      <tr className="border-b border-gray-700 print:border-gray-300 text-gray-400 print:text-gray-600 text-xs">
                        <th className="text-left py-2 pr-8 font-medium">Period</th>
                        <th className="text-right py-2 pr-8 font-medium">Revenue (MYR)</th>
                        <th className="text-right py-2 font-medium">MoM Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50 print:divide-gray-200">
                      {sortedMonths.map(([key, val], idx) => {
                        const [yr, mo] = key.split('-')
                        const prev = idx > 0 ? sortedMonths[idx - 1][1] : null
                        const chg  = prev && prev > 0 ? ((val - prev) / prev) * 100 : null
                        return (
                          <tr key={key}>
                            <td className="py-2 pr-8 text-gray-300 print:text-gray-700">{MONTH_NAMES[parseInt(mo) - 1]} {yr}</td>
                            <td className="py-2 pr-8 text-right tabular-nums text-white print:text-gray-900 font-medium">{fmtMyr(val)}</td>
                            <td className={`py-2 text-right tabular-nums text-xs font-medium ${chg !== null ? varClass(chg) : 'text-gray-600'}`}>
                              {chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {(() => {
                const recent    = sortedMonths.slice(-3)
                const avgVal    = recent.reduce((s, [, v]) => s + v, 0) / recent.length
                const growths   = recent.slice(1).map(([, v], i) => recent[i][1] > 0 ? (v - recent[i][1]) / recent[i][1] : 0)
                const avgGrowth = growths.length > 0 ? growths.reduce((a, b) => a + b, 0) / growths.length : 0
                const [lastYr, lastMo] = sortedMonths[sortedMonths.length - 1][0].split('-').map(Number)
                const projections = [1, 2, 3].map(offset => {
                  let m = lastMo + offset
                  let y = lastYr
                  if (m > 12) { m -= 12; y += 1 }
                  return { label: `${MONTH_NAMES[m - 1]} ${y}`, value: avgVal * Math.pow(1 + avgGrowth, offset) }
                })

                return (
                  <>
                    <p className="text-xs font-semibold text-gray-400 print:text-gray-600 uppercase tracking-wider mb-3">Projected Revenue — Next 3 Months</p>
                    <div className="grid grid-cols-3 gap-4 print:gap-3 mb-4">
                      {projections.map(p => (
                        <div key={p.label} className="bg-gray-800/30 rounded-xl p-4 border border-dashed border-gray-700 print:rounded-md print:border-gray-300 print:p-3 print:bg-gray-50">
                          <p className="text-xs text-gray-500 print:text-gray-600 mb-2">{p.label} <span className="italic">(Projected)</span></p>
                          <p className="text-xl font-bold text-gray-200 print:text-gray-800 print:text-lg">{fmtMyr(p.value)}</p>
                          <p className="text-[10px] text-gray-600 print:text-gray-500 mt-1">
                            ~{avgGrowth >= 0 ? '+' : ''}{(avgGrowth * 100).toFixed(1)}% MoM trend
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-600 print:text-gray-500 italic">
                      Based on {(avgGrowth * 100).toFixed(1)}% average monthly growth rate from trailing 3 months actual AR data.
                    </p>
                  </>
                )
              })()}
            </>
          ) : (
            <p className="text-gray-500 text-sm py-4">{loading ? 'Loading trend data…' : 'Insufficient historical data for projections. Minimum 3 months of data required.'}</p>
          )}
        </Section>

        {/* ── 10. Key Insights ─────────────────────────────────────────────── */}
        <Section title="Key Insights & Management Commentary">
          {allInsights.length > 0 ? (
            <div className="space-y-3 print:space-y-2">
              {(['critical', 'warning', 'positive', 'info'] as const).flatMap(level =>
                allInsights
                  .filter(i => i.level === level)
                  .map((insight, idx) => (
                    <div
                      key={`${level}-${idx}`}
                      className={`flex items-start gap-3 p-4 rounded-lg border print:p-2.5 print:rounded-md ${insightColor(insight.level)}`}
                    >
                      <span className="text-xl flex-shrink-0 print:text-sm mt-0.5">{insightIcon(insight.level)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{insight.category}</span>
                        </div>
                        <p className="text-sm font-semibold">{insight.headline}</p>
                        <p className="text-xs opacity-70 mt-1 leading-relaxed">{insight.detail}</p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-4">
              {loading ? 'Analysing financial data…' : 'Financial data required to generate management insights. Ensure P&L, Balance Sheet, and Cash Flow data is available in Zoho Books.'}
            </p>
          )}
        </Section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-800 print:border-gray-200 pt-6 pb-8 print:pt-4 print:pb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 print:text-gray-600">
                Data refreshed: {new Date(data.lastRefreshed).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <p className="text-xs text-gray-600 print:text-gray-500 mt-1 max-w-2xl">
                Auto-generated from Zoho Books live data. Financial projections are indicative only and should not be relied upon for investment decisions.
                For detailed analysis, refer to Financial Statements and AR Dashboard.
              </p>
            </div>
            <div className="hidden print:block">
              <HexaLogo className="h-6 opacity-40" />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
