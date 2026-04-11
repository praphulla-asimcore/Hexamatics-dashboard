'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { DashboardData, PeriodDef, AnnualYearData } from '@/types'
import {
  fmtMyr, fmtLocal, fmtPct, fmtChange, fmtDays,
  collectionColor, ENTITY_COLORS,
} from '@/lib/format'
import { HexaLogo } from './HexaLogo'
import { KpiCard } from './KpiCard'
import { PeriodSelector } from './PeriodSelector'
import { RevenueBarChart } from './charts/RevenueBarChart'
import { MonthlyCompareChart } from './charts/MonthlyCompareChart'
import { TrendLineChart } from './charts/TrendLineChart'
import { CollectionTrendChart } from './charts/CollectionTrendChart'
import { StatusDonutChart } from './charts/StatusDonutChart'
import { ArAgingChart } from './charts/ArAgingChart'
import { RevenueMixDonutChart } from './charts/RevenueMixDonutChart'
import { AnnualCompareChart } from './charts/AnnualCompareChart'
import { EntityTable } from './EntityTable'
import { FinancialRatiosTable } from './FinancialRatiosTable'

type Tab = 'executive' | 'overview' | 'revenue' | 'annual' | 'collections' | 'ratios' | 'entities'

interface Props {
  initialData: DashboardData
  initialPeriod: PeriodDef
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'executive', label: 'Executive' },
  { key: 'overview', label: 'Overview' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'annual', label: 'Annual View' },
  { key: 'collections', label: 'Collections & AR' },
  { key: 'ratios', label: 'Financial Ratios' },
  { key: 'entities', label: 'Entities' },
]

function computeWeightedDso(entities: DashboardData['entities']): number {
  const active = entities.filter((e) => e.period.total > 0)
  if (!active.length) return 0
  const totalMyr = active.reduce((s, e) => s + e.period.totalMyr, 0)
  if (totalMyr === 0) return 0
  return active.reduce((s, e) => s + e.ratios.dso * e.period.totalMyr, 0) / totalMyr
}

function computeGroupOverdueRatio(entities: DashboardData['entities']): number {
  const totalAr = entities.reduce((s, e) => {
    const ag = e.arAging
    return s + (ag.current + ag.days1to30 + ag.days31to60 + ag.days61to90 + ag.days90plus) * e.org.fxToMyr
  }, 0)
  const overdueAr = entities.reduce((s, e) => {
    const ag = e.arAging
    return s + (ag.days1to30 + ag.days31to60 + ag.days61to90 + ag.days90plus) * e.org.fxToMyr
  }, 0)
  return totalAr > 0 ? (overdueAr / totalAr) * 100 : 0
}

export function DashboardClient({ initialData, initialPeriod }: Props) {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData>(initialData)
  const [period, setPeriod] = useState<PeriodDef>(initialPeriod)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('executive')
  const [annualData, setAnnualData] = useState<AnnualYearData[] | null>(null)
  const [annualLoading, setAnnualLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (p: PeriodDef) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        mode: p.mode,
        year: String(p.year),
        ...(p.month ? { month: String(p.month) } : {}),
        ...(p.quarter ? { quarter: String(p.quarter) } : {}),
        ...(p.half ? { half: String(p.half) } : {}),
        comparison: p.comparison ?? 'previous',
      })
      const res = await fetch(`/api/zoho/dashboard?${params}`, {
        signal: controller.signal,
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setData(json)
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message ?? 'Failed to load dashboard data')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const fetchAnnual = useCallback(async (force = false) => {
    setAnnualLoading(true)
    try {
      const res = await fetch(`/api/zoho/annual?fromYear=2023${force ? '&refresh=true' : ''}`)
      const json = await res.json()
      if (!json.error && Array.isArray(json)) setAnnualData(json)
    } finally {
      setAnnualLoading(false)
    }
  }, [])

  // Auto-fetch on mount (page no longer pre-loads data server-side)
  useEffect(() => {
    fetchData(initialPeriod)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch annual data when that tab is first opened
  useEffect(() => {
    if (activeTab === 'annual' && !annualData && !annualLoading) {
      fetchAnnual()
    }
  }, [activeTab, annualData, annualLoading, fetchAnnual])

  const handlePeriodChange = (p: PeriodDef) => {
    setPeriod(p)
    fetchData(p)
  }

  const { group, entities, periodLabel, comparisonLabel, lastRefreshed } = data

  const revenueGrowth = group.comparisonTotalMyr && group.comparisonTotalMyr > 0
    ? ((group.totalMyr - group.comparisonTotalMyr) / group.comparisonTotalMyr) * 100
    : null

  const collRateChange = group.comparisonCollectionRate !== undefined
    ? group.collectionRate - group.comparisonCollectionRate
    : null

  const weightedDso = computeWeightedDso(entities)
  const groupOverdueRatio = computeGroupOverdueRatio(entities)
  const groupAr90plus = entities.reduce((s, e) => s + e.arAging.days90plus * e.org.fxToMyr, 0)
  const groupAvgInvoice = entities.reduce((s, e) => s + e.period.totalMyr, 0) /
    Math.max(entities.reduce((s, e) => s + e.period.count, 0), 1)

  const activeEntities = entities.filter((e) => e.period.total > 0)
  const rankedEntities = [...activeEntities].sort((a, b) => b.period.totalMyr - a.period.totalMyr)

  // ─── Automated alerts ────────────────────────────────────────────────────────
  type AlertLevel = 'critical' | 'warning' | 'good' | 'info'
  const alerts: { level: AlertLevel; msg: string }[] = []

  if (groupAr90plus > 0) {
    alerts.push({ level: 'critical', msg: `${fmtMyr(groupAr90plus)} in 90+ day overdue AR requires immediate action` })
  }
  if (group.collectionRate < 70) {
    alerts.push({ level: 'critical', msg: `Group collection rate of ${fmtPct(group.collectionRate)} is critically low` })
  } else if (group.collectionRate < 85) {
    alerts.push({ level: 'warning', msg: `Group collection rate of ${fmtPct(group.collectionRate)} is below target (85%)` })
  } else {
    alerts.push({ level: 'good', msg: `Group collection rate of ${fmtPct(group.collectionRate)} is healthy` })
  }
  if (weightedDso > 60) {
    alerts.push({ level: 'critical', msg: `Group DSO of ${fmtDays(weightedDso)} exceeds 60-day threshold` })
  } else if (weightedDso > 30) {
    alerts.push({ level: 'warning', msg: `Group DSO of ${fmtDays(weightedDso)} — monitor payment velocity` })
  }
  if (revenueGrowth !== null) {
    if (revenueGrowth < -10) {
      alerts.push({ level: 'warning', msg: `Revenue declined ${fmtChange(revenueGrowth)} vs ${comparisonLabel}` })
    } else if (revenueGrowth > 20) {
      alerts.push({ level: 'good', msg: `Strong growth of ${fmtChange(revenueGrowth)} vs ${comparisonLabel}` })
    } else if (revenueGrowth > 0) {
      alerts.push({ level: 'info', msg: `Revenue grew ${fmtChange(revenueGrowth)} vs ${comparisonLabel}` })
    }
  }
  const worstCollector = activeEntities.reduce(
    (worst, e) => (e.ratios.collectionRate < (worst?.ratios.collectionRate ?? 100) ? e : worst),
    null as (typeof entities)[0] | null
  )
  if (worstCollector && worstCollector.ratios.collectionRate < 70) {
    alerts.push({
      level: 'warning',
      msg: `${worstCollector.org.short} has lowest collection rate at ${fmtPct(worstCollector.ratios.collectionRate)}`,
    })
  }
  const topEntityShare = group.totalMyr > 0 && rankedEntities.length > 0
    ? (rankedEntities[0].period.totalMyr / group.totalMyr) * 100 : 0
  if (topEntityShare > 60) {
    alerts.push({
      level: 'info',
      msg: `${rankedEntities[0]?.org.short} contributes ${fmtPct(topEntityShare)} of group revenue`,
    })
  }

  const alertColors: Record<AlertLevel, string> = {
    critical: 'border-red-800 bg-red-950/30 text-red-300',
    warning: 'border-amber-800 bg-amber-950/30 text-amber-300',
    good: 'border-emerald-800 bg-emerald-950/30 text-emerald-300',
    info: 'border-gray-700 bg-gray-800/30 text-gray-300',
  }
  const alertIcons: Record<AlertLevel, string> = {
    critical: '⚠',
    warning: '▲',
    good: '✓',
    info: 'ℹ',
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <HexaLogo className="h-7" />
            <div className="flex items-center gap-0.5 ml-2">
              <a href="/dashboard"
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white">
                AR Dashboard
              </a>
              <a href="/financials"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                Financial Statements
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:block text-xs text-gray-600">
              {session?.user?.name ?? session?.user?.email}
            </span>
            <button
              onClick={() => fetchData({ ...period })}
              disabled={loading}
              className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
            >
              {loading ? 'Loading…' : '⟳ Refresh'}
            </button>
            {(session?.user as any)?.role === 'admin' && (
              <a href="/admin/users" className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 px-3 py-1.5 rounded-lg transition">
                Users
              </a>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Period selector bar ────────────────────────────────────── */}
      <div className="bg-gray-900/60 border-b border-gray-800 sticky top-14 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-start justify-between gap-3">
          <PeriodSelector value={period} onChange={handlePeriodChange} loading={loading} />
          <div className="text-xs text-gray-600 pt-1">
            Updated {new Date(lastRefreshed).toLocaleString('en-MY', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Loading / Error state ─────────────────────────────────── */}
        {loading && data.entities.length === 0 && (
          <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
            <span className="animate-spin mr-2">⟳</span> Loading dashboard data…
          </div>
        )}
        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-sm text-red-300">
            <span className="font-semibold">Error loading data: </span>{error}
          </div>
        )}

        {/* ── KPI Row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label={`Revenue · ${periodLabel}`}
            value={fmtMyr(group.totalMyr)}
            sub={revenueGrowth !== null ? `${fmtChange(revenueGrowth)} vs ${comparisonLabel}` : `${activeEntities.length} active entities`}
            trend={revenueGrowth !== null ? (revenueGrowth >= 0 ? 'up' : 'down') : undefined}
            highlight
          />
          <KpiCard
            label="Collection Rate"
            value={fmtPct(group.collectionRate)}
            sub={collRateChange !== null
              ? `${collRateChange >= 0 ? '+' : ''}${collRateChange.toFixed(1)}pp vs ${comparisonLabel}`
              : `${fmtMyr(group.outstandingMyr)} outstanding`}
            trend={group.collectionRate >= 90 ? 'up' : group.collectionRate >= 70 ? 'warn' : 'down'}
          />
          <KpiCard
            label="AR Outstanding"
            value={fmtMyr(group.outstandingMyr)}
            sub={group.totalMyr > 0 ? `${fmtPct((group.outstandingMyr / group.totalMyr) * 100)} of billed` : '—'}
            trend={group.outstandingMyr > group.totalMyr * 0.2 ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Group DSO"
            value={fmtDays(weightedDso)}
            sub="Days sales outstanding"
            trend={weightedDso <= 30 ? 'up' : weightedDso <= 60 ? 'warn' : 'down'}
          />
          <KpiCard
            label="Overdue AR"
            value={fmtPct(groupOverdueRatio)}
            sub={`${fmtMyr(entities.reduce((s, e) => s + (e.arAging.days1to30 + e.arAging.days31to60 + e.arAging.days61to90 + e.arAging.days90plus) * e.org.fxToMyr, 0))} overdue`}
            trend={groupOverdueRatio <= 20 ? 'up' : groupOverdueRatio <= 50 ? 'warn' : 'down'}
          />
          <KpiCard
            label="Avg Invoice"
            value={fmtMyr(groupAvgInvoice)}
            sub={`${group.invoiceCount} invoices`}
            trend="neutral"
          />
        </div>

        {/* ── Tab navigation ────────────────────────────────────────── */}
        <div className="border-b border-gray-800">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-hexa-purple text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* EXECUTIVE TAB                                               */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'executive' && (
          <div className="space-y-6">
            {/* Alerts panel */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Automated Intelligence · {periodLabel}
              </h3>
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-4 py-2.5 rounded-lg border text-sm ${alertColors[alert.level]}`}
                  >
                    <span className="font-bold mt-0.5 flex-shrink-0">{alertIcons[alert.level]}</span>
                    <span>{alert.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Entity performance ranking */}
              <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Entity Performance Ranking — {periodLabel}
                </h3>
                <div className="space-y-3">
                  {rankedEntities.map((e, i) => {
                    const share = group.totalMyr > 0 ? (e.period.totalMyr / group.totalMyr) * 100 : 0
                    const growth = e.comparison?.totalMyr && e.comparison.totalMyr > 0
                      ? ((e.period.totalMyr - e.comparison.totalMyr) / e.comparison.totalMyr) * 100
                      : null
                    const pct = e.ratios.collectionRate
                    return (
                      <div key={e.org.id} className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-600 w-5 text-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }}
                        />
                        <span className="text-sm text-gray-200 w-28 flex-shrink-0">{e.org.short}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${share}%`,
                              background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length],
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-white tabular-nums w-24 text-right flex-shrink-0">
                          {fmtMyr(e.period.totalMyr)}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums w-10 text-right flex-shrink-0">
                          {fmtPct(share, 0)}
                        </span>
                        <span className={`text-xs font-medium tabular-nums w-14 text-right flex-shrink-0 ${
                          pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {fmtPct(pct, 0)} col.
                        </span>
                        {growth !== null && (
                          <span className={`text-xs tabular-nums w-12 text-right flex-shrink-0 ${
                            growth >= 0 ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {fmtChange(growth)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {rankedEntities.length === 0 && (
                    <p className="text-sm text-gray-600 text-center py-4">No revenue data for this period</p>
                  )}
                </div>
              </div>

              {/* Executive scorecard */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Group Scorecard
                </h3>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Revenue Health',
                      score: revenueGrowth === null ? 'N/A' : revenueGrowth >= 10 ? 'A' : revenueGrowth >= 0 ? 'B' : revenueGrowth >= -10 ? 'C' : 'D',
                      detail: revenueGrowth !== null ? fmtChange(revenueGrowth) : 'No prior period',
                      color: revenueGrowth === null ? 'text-gray-500' : revenueGrowth >= 10 ? 'text-emerald-400' : revenueGrowth >= 0 ? 'text-blue-400' : 'text-amber-400',
                    },
                    {
                      label: 'Collection Efficiency',
                      score: group.collectionRate >= 95 ? 'A+' : group.collectionRate >= 90 ? 'A' : group.collectionRate >= 80 ? 'B' : group.collectionRate >= 70 ? 'C' : 'D',
                      detail: fmtPct(group.collectionRate),
                      color: group.collectionRate >= 90 ? 'text-emerald-400' : group.collectionRate >= 70 ? 'text-amber-400' : 'text-red-400',
                    },
                    {
                      label: 'DSO Performance',
                      score: weightedDso <= 20 ? 'A+' : weightedDso <= 30 ? 'A' : weightedDso <= 45 ? 'B' : weightedDso <= 60 ? 'C' : 'D',
                      detail: fmtDays(weightedDso),
                      color: weightedDso <= 30 ? 'text-emerald-400' : weightedDso <= 60 ? 'text-amber-400' : 'text-red-400',
                    },
                    {
                      label: 'AR Quality',
                      score: groupOverdueRatio <= 10 ? 'A+' : groupOverdueRatio <= 20 ? 'A' : groupOverdueRatio <= 35 ? 'B' : groupOverdueRatio <= 50 ? 'C' : 'D',
                      detail: `${fmtPct(groupOverdueRatio)} overdue`,
                      color: groupOverdueRatio <= 20 ? 'text-emerald-400' : groupOverdueRatio <= 50 ? 'text-amber-400' : 'text-red-400',
                    },
                    {
                      label: 'Critical AR (90d+)',
                      score: groupAr90plus === 0 ? 'A+' : groupAr90plus < 50000 ? 'B' : groupAr90plus < 200000 ? 'C' : 'D',
                      detail: groupAr90plus > 0 ? fmtMyr(groupAr90plus) : 'None',
                      color: groupAr90plus === 0 ? 'text-emerald-400' : groupAr90plus < 50000 ? 'text-amber-400' : 'text-red-400',
                    },
                  ].map(({ label, score, detail, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-xs text-gray-400">{detail}</p>
                      </div>
                      <span className={`text-2xl font-black tabular-nums ${color}`}>{score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Revenue mix */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Revenue Mix — {periodLabel}
                </h3>
                <RevenueMixDonutChart entities={entities} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Period Comparison (MYR)
                </h3>
                <MonthlyCompareChart
                  currentTotal={group.totalMyr}
                  prevTotal={group.comparisonTotalMyr ?? 0}
                  periodLabel={periodLabel}
                  comparisonLabel={comparisonLabel}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* OVERVIEW TAB                                                */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Revenue by entity — {periodLabel} (MYR)</h3>
                <RevenueBarChart entities={entities} periodLabel={periodLabel} comparisonLabel={comparisonLabel} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Period comparison (MYR)</h3>
                <MonthlyCompareChart
                  currentTotal={group.totalMyr}
                  prevTotal={group.comparisonTotalMyr ?? 0}
                  periodLabel={periodLabel}
                  comparisonLabel={comparisonLabel}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Invoice status mix — {periodLabel}</h3>
                <StatusDonutChart entities={entities} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">AR aging — outstanding balance</h3>
                <ArAgingChart entities={entities} />
              </div>
            </div>

            {/* Entity health grid */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Collection health by entity — {periodLabel}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {entities.filter((e) => e.period.total > 0).map((e, i) => {
                  const pct = e.ratios.collectionRate
                  const growth = e.comparison?.totalMyr
                    ? ((e.period.totalMyr - e.comparison.totalMyr) / e.comparison.totalMyr) * 100
                    : null
                  return (
                    <div key={e.org.id} className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }} />
                        <p className="text-xs text-gray-400 truncate">{e.org.short}</p>
                      </div>
                      <p className="text-base font-bold text-white tabular-nums">{fmtMyr(e.period.totalMyr)}</p>
                      <p className={`text-xs font-semibold tabular-nums mt-0.5 ${
                        pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {fmtPct(pct)} collected
                      </p>
                      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      {growth !== null && (
                        <p className={`text-[10px] mt-1.5 ${growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {fmtChange(growth)} vs {comparisonLabel}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* REVENUE TAB                                                 */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">12-month revenue trend — group & entities (MYR)</h3>
              <TrendLineChart entities={entities} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Revenue mix — {periodLabel}</h3>
                <RevenueMixDonutChart entities={entities} />
              </div>

              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">
                  Period analysis — {periodLabel}{comparisonLabel ? ` vs ${comparisonLabel}` : ''}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="pb-2 text-left text-xs text-gray-500">Entity</th>
                        <th className="pb-2 text-right text-xs text-gray-500">{periodLabel}</th>
                        {comparisonLabel && <th className="pb-2 text-right text-xs text-gray-500">{comparisonLabel}</th>}
                        <th className="pb-2 text-right text-xs text-gray-500">Growth</th>
                        <th className="pb-2 text-right text-xs text-gray-500">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entities
                        .filter((e) => e.period.totalMyr > 0 || (e.comparison?.totalMyr ?? 0) > 0)
                        .sort((a, b) => b.period.totalMyr - a.period.totalMyr)
                        .map((e) => {
                          const curr = e.period.totalMyr
                          const prev = e.comparison?.totalMyr ?? 0
                          const growth = prev > 0 ? ((curr - prev) / prev) * 100 : null
                          const share = group.totalMyr > 0 ? (curr / group.totalMyr) * 100 : 0
                          return (
                            <tr key={e.org.id} className="border-b border-gray-800/50">
                              <td className="py-2 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }} />
                                <span className="text-gray-300 text-xs">{e.org.short}</span>
                              </td>
                              <td className="py-2 text-right tabular-nums text-white text-xs font-medium">
                                {curr > 0 ? fmtMyr(curr) : '—'}
                              </td>
                              {comparisonLabel && (
                                <td className="py-2 text-right tabular-nums text-gray-500 text-xs">
                                  {prev > 0 ? fmtMyr(prev) : '—'}
                                </td>
                              )}
                              <td className="py-2 text-right text-xs font-semibold">
                                {growth !== null ? (
                                  <span className={growth >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {fmtChange(growth)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-2 text-right text-xs text-gray-500">
                                {share > 0 ? fmtPct(share, 0) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-700">
                        <td className="pt-2 text-xs font-semibold text-gray-400">Group</td>
                        <td className="pt-2 text-right tabular-nums font-bold text-white text-xs">{fmtMyr(group.totalMyr)}</td>
                        {comparisonLabel && (
                          <td className="pt-2 text-right tabular-nums font-semibold text-gray-500 text-xs">
                            {group.comparisonTotalMyr ? fmtMyr(group.comparisonTotalMyr) : '—'}
                          </td>
                        )}
                        <td className="pt-2 text-right text-xs font-bold">
                          {revenueGrowth !== null ? (
                            <span className={revenueGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {fmtChange(revenueGrowth)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="pt-2 text-right text-xs text-gray-600">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Revenue by entity — {periodLabel} vs {comparisonLabel || 'prior period'} (MYR)</h3>
              <RevenueBarChart entities={entities} periodLabel={periodLabel} comparisonLabel={comparisonLabel} />
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ANNUAL VIEW TAB                                             */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'annual' && (
          <div className="space-y-6">
            {annualLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
                <span className="w-5 h-5 rounded-full border-2 border-hexa-purple border-t-transparent animate-spin" />
                <span className="text-sm">Fetching annual data from Zoho…</span>
              </div>
            )}

            {!annualLoading && annualData && (
              <>
                {/* Stacked bar chart */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-medium text-gray-500">Annual revenue by entity — stacked (MYR)</h3>
                    <button
                      onClick={() => fetchAnnual(true)}
                      className="text-xs text-gray-600 hover:text-gray-400 transition"
                    >
                      ⟳ Refresh
                    </button>
                  </div>
                  <AnnualCompareChart data={annualData} />
                </div>

                {/* YoY growth table */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                  <h3 className="text-xs font-medium text-gray-500 mb-4">Year-over-year revenue growth (MYR)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="pb-2.5 text-left text-xs font-medium text-gray-500">Entity</th>
                          {annualData.map((y) => (
                            <th key={y.year} className="pb-2.5 text-right text-xs font-medium text-gray-500">
                              {y.year}
                            </th>
                          ))}
                          {annualData.length >= 2 && (
                            <th className="pb-2.5 text-right text-xs font-medium text-gray-500">
                              CAGR
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {annualData[0]?.entities
                          .filter((e) => annualData.some((y) => {
                            const row = y.entities.find((r) => r.orgId === e.orgId)
                            return (row?.totalMyr ?? 0) > 0
                          }))
                          .map((entityRow, ei) => {
                            const rows = annualData.map((y) =>
                              y.entities.find((r) => r.orgId === entityRow.orgId)
                            )
                            const firstVal = rows.find((r) => (r?.totalMyr ?? 0) > 0)?.totalMyr ?? 0
                            const lastVal = rows[rows.length - 1]?.totalMyr ?? 0
                            const n = annualData.length - 1
                            const cagr = n > 0 && firstVal > 0
                              ? (Math.pow(lastVal / firstVal, 1 / n) - 1) * 100
                              : null
                            return (
                              <tr key={entityRow.orgId} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                                <td className="py-2.5 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: ENTITY_COLORS[ei % ENTITY_COLORS.length] }} />
                                  <span className="text-gray-200 text-xs">{entityRow.orgShort}</span>
                                </td>
                                {rows.map((row, ri) => {
                                  const prevRow = ri > 0 ? rows[ri - 1] : null
                                  const curr = row?.totalMyr ?? 0
                                  const prev = prevRow?.totalMyr ?? 0
                                  const growth = ri > 0 && prev > 0 ? ((curr - prev) / prev) * 100 : null
                                  return (
                                    <td key={ri} className="py-2.5 text-right">
                                      <div className="text-xs tabular-nums text-white font-medium">
                                        {curr > 0 ? fmtMyr(curr) : <span className="text-gray-700">—</span>}
                                      </div>
                                      {growth !== null && (
                                        <div className={`text-[10px] tabular-nums ${growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                          {fmtChange(growth)}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                                {annualData.length >= 2 && (
                                  <td className="py-2.5 text-right">
                                    {cagr !== null ? (
                                      <span className={`text-xs font-semibold tabular-nums ${cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {fmtChange(cagr)}
                                      </span>
                                    ) : <span className="text-gray-700 text-xs">—</span>}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-700 bg-gray-800/30">
                          <td className="py-2.5 text-xs font-semibold text-gray-400">Group Total</td>
                          {annualData.map((y, ri) => {
                            const prevYear = ri > 0 ? annualData[ri - 1] : null
                            const growth = prevYear && prevYear.group.totalMyr > 0
                              ? ((y.group.totalMyr - prevYear.group.totalMyr) / prevYear.group.totalMyr) * 100
                              : null
                            return (
                              <td key={y.year} className="py-2.5 text-right">
                                <div className="text-xs font-bold text-white tabular-nums">{fmtMyr(y.group.totalMyr)}</div>
                                {growth !== null && (
                                  <div className={`text-[10px] tabular-nums ${growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {fmtChange(growth)}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          {annualData.length >= 2 && (() => {
                            const first = annualData[0].group.totalMyr
                            const last = annualData[annualData.length - 1].group.totalMyr
                            const n = annualData.length - 1
                            const cagr = first > 0 ? (Math.pow(last / first, 1 / n) - 1) * 100 : null
                            return (
                              <td className="py-2.5 text-right">
                                {cagr !== null && (
                                  <span className={`text-xs font-bold tabular-nums ${cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {fmtChange(cagr)}
                                  </span>
                                )}
                              </td>
                            )
                          })()}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Annual metrics grid */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                  <h3 className="text-xs font-medium text-gray-500 mb-4">Annual financial metrics by year</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {annualData.map((y) => {
                      const prevY = annualData.find((d) => d.year === y.year - 1)
                      const growth = prevY && prevY.group.totalMyr > 0
                        ? ((y.group.totalMyr - prevY.group.totalMyr) / prevY.group.totalMyr) * 100
                        : null
                      return (
                        <div key={y.year} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                          <p className="text-sm font-bold text-gray-300 mb-3">{y.year}</p>
                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] text-gray-600">Revenue</p>
                              <p className="text-sm font-semibold text-white tabular-nums">{fmtMyr(y.group.totalMyr)}</p>
                              {growth !== null && (
                                <p className={`text-[10px] ${growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {fmtChange(growth)} YoY
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600">Collection Rate</p>
                              <p className={`text-sm font-semibold tabular-nums ${collectionColor(y.group.collectionRate)}`}>
                                {fmtPct(y.group.collectionRate)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600">Outstanding</p>
                              <p className="text-sm font-semibold text-amber-400 tabular-nums">{fmtMyr(y.group.outstandingMyr)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600">Invoices</p>
                              <p className="text-sm font-semibold text-gray-300 tabular-nums">{y.group.count.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {!annualLoading && !annualData && (
              <div className="text-center py-20">
                <button
                  onClick={() => fetchAnnual()}
                  className="text-sm bg-hexa-gradient text-white px-6 py-2.5 rounded-lg hover:opacity-90 transition"
                >
                  Load Annual Data
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* COLLECTIONS & AR TAB                                        */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'collections' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">AR aging — outstanding balance</h3>
                <ArAgingChart entities={entities} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Invoice status mix — {periodLabel}</h3>
                <StatusDonutChart entities={entities} />
              </div>
            </div>

            {/* Collection rate trend */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">12-month collection rate trend (%)</h3>
              <CollectionTrendChart entities={entities} />
            </div>

            {/* Collections detail table */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Collections detail by entity — {periodLabel}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="pb-2 text-left text-xs text-gray-500">Entity</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Billed</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Collected</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Outstanding</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Not Due</th>
                      <th className="pb-2 text-right text-xs text-gray-500">1–30d</th>
                      <th className="pb-2 text-right text-xs text-gray-500">31–60d</th>
                      <th className="pb-2 text-right text-xs text-gray-500">61–90d</th>
                      <th className="pb-2 text-right text-xs text-gray-500">90d+</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities
                      .filter((e) => e.period.total > 0)
                      .sort((a, b) => b.period.outstanding - a.period.outstanding)
                      .map((e) => {
                        const pct = e.ratios.collectionRate
                        const fx = e.org.fxToMyr
                        const ag = e.arAging
                        return (
                          <tr key={e.org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                            <td className="py-2.5 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full"
                                style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }} />
                              <span className="text-gray-200 text-xs">{e.org.short}</span>
                            </td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-gray-300">{fmtMyr(e.period.totalMyr)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-emerald-400">{fmtMyr(e.period.collected * fx)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-amber-400">{fmtMyr(e.period.outstanding * fx)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-gray-400">{ag.current > 0 ? fmtMyr(ag.current * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-orange-300">{ag.days1to30 > 0 ? fmtMyr(ag.days1to30 * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-orange-400">{ag.days31to60 > 0 ? fmtMyr(ag.days31to60 * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-red-400">{ag.days61to90 > 0 ? fmtMyr(ag.days61to90 * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-red-500 font-semibold">{ag.days90plus > 0 ? fmtMyr(ag.days90plus * fx) : '—'}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-xs font-semibold ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                                {fmtPct(pct)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700 bg-gray-800/30">
                      <td colSpan={2} className="py-2.5 text-xs font-semibold text-gray-400">
                        Group Total — {fmtMyr(group.totalMyr)}
                      </td>
                      <td className="py-2.5 text-right text-xs font-bold tabular-nums text-emerald-400">{fmtMyr(group.collectedMyr)}</td>
                      <td className="py-2.5 text-right text-xs font-bold tabular-nums text-amber-400">{fmtMyr(group.outstandingMyr)}</td>
                      <td colSpan={5} />
                      <td className="py-2.5 text-right">
                        <span className={`text-xs font-bold ${collectionColor(group.collectionRate)}`}>
                          {fmtPct(group.collectionRate)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Top customers */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Top customers by entity — {periodLabel}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {entities
                  .filter((e) => e.topCustomers.length > 0 && e.period.total > 0)
                  .map((e) => (
                    <div key={e.org.id} className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-400">{e.org.short}</p>
                      {e.topCustomers.slice(0, 5).map((c, ci) => (
                        <div key={c.name} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate flex-1 mr-2">
                            <span className="text-gray-600 mr-1">{ci + 1}.</span>
                            {c.name}
                          </span>
                          <span className="tabular-nums text-white font-medium flex-shrink-0">
                            {fmtMyr(c.total * e.org.fxToMyr)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* FINANCIAL RATIOS TAB                                        */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'ratios' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-1">Avg Collection Rate</p>
                <p className={`text-2xl font-bold tabular-nums ${collectionColor(group.collectionRate)}`}>
                  {fmtPct(group.collectionRate)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Group weighted avg</p>
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-1">Group DSO</p>
                <p className={`text-2xl font-bold tabular-nums ${weightedDso <= 30 ? 'text-emerald-400' : weightedDso <= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {fmtDays(weightedDso)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Weighted average</p>
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-1">AR Overdue (Group)</p>
                <p className={`text-2xl font-bold tabular-nums ${groupOverdueRatio <= 20 ? 'text-emerald-400' : groupOverdueRatio <= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {fmtPct(groupOverdueRatio)}
                </p>
                <p className="text-xs text-gray-600 mt-1">{fmtMyr(entities.reduce((s, e) => s + (e.arAging.days1to30 + e.arAging.days31to60 + e.arAging.days61to90 + e.arAging.days90plus) * e.org.fxToMyr, 0))} overdue</p>
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-1">90+ Days AR</p>
                <p className={`text-2xl font-bold tabular-nums ${groupAr90plus === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtMyr(groupAr90plus)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Critical overdue</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Financial ratios by entity — {periodLabel}</h3>
              <FinancialRatiosTable entities={entities} />
            </div>

            {/* Ratio benchmarks */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Entity ratio summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="pb-2 text-left text-xs text-gray-500">Entity</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Invoices</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Avg Invoice</th>
                      <th className="pb-2 text-right text-xs text-gray-500">DSO</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Collection</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Overdue%</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Top Cust%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities
                      .filter((e) => e.period.total > 0)
                      .sort((a, b) => b.period.totalMyr - a.period.totalMyr)
                      .map((e) => (
                        <tr key={e.org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                          <td className="py-2.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full"
                              style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }} />
                            <span className="text-gray-200 text-xs">{e.org.short}</span>
                          </td>
                          <td className="py-2.5 text-right text-xs tabular-nums text-gray-400">{e.period.count}</td>
                          <td className="py-2.5 text-right text-xs tabular-nums text-gray-300">
                            {fmtLocal(e.ratios.avgInvoiceValue, e.org.currency)}
                          </td>
                          <td className={`py-2.5 text-right text-xs font-semibold tabular-nums ${
                            e.ratios.dso <= 30 ? 'text-emerald-400' : e.ratios.dso <= 60 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {fmtDays(e.ratios.dso)}
                          </td>
                          <td className={`py-2.5 text-right text-xs font-semibold tabular-nums ${
                            e.ratios.collectionRate >= 90 ? 'text-emerald-400' : e.ratios.collectionRate >= 70 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {fmtPct(e.ratios.collectionRate)}
                          </td>
                          <td className={`py-2.5 text-right text-xs tabular-nums ${
                            e.ratios.overdueRatio <= 20 ? 'text-emerald-400' : e.ratios.overdueRatio <= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {fmtPct(e.ratios.overdueRatio)}
                          </td>
                          <td className={`py-2.5 text-right text-xs tabular-nums ${
                            e.ratios.topCustomerConc <= 30 ? 'text-emerald-400' : e.ratios.topCustomerConc <= 60 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {fmtPct(e.ratios.topCustomerConc)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ENTITIES TAB                                                */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'entities' && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">
                Entity detail — {periodLabel}{comparisonLabel ? ` vs ${comparisonLabel}` : ''}
              </h3>
              <EntityTable entities={entities} periodLabel={periodLabel} comparisonLabel={comparisonLabel} />
              <p className="text-xs text-gray-700 mt-4">
                FX rates (indicative) — SGD: 3.35 · IDR: 0.000284 · PHP: 0.077 · MMK: 0.00214 · BDT: 0.038 · NPR: 0.0284 per MYR ·
                Live data from Zoho Books
              </p>
            </div>

            {/* Per-entity detailed cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {entities
                .filter((e) => e.period.total > 0)
                .sort((a, b) => b.period.totalMyr - a.period.totalMyr)
                .map((e) => {
                  const pct = e.ratios.collectionRate
                  const growth = e.comparison?.totalMyr && e.comparison.totalMyr > 0
                    ? ((e.period.totalMyr - e.comparison.totalMyr) / e.comparison.totalMyr) * 100
                    : null
                  return (
                    <div key={e.org.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full"
                            style={{ background: ENTITY_COLORS[entities.indexOf(e) % ENTITY_COLORS.length] }} />
                          <span className="font-semibold text-white text-sm">{e.org.name}</span>
                        </div>
                        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">{e.org.currency}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-gray-600">Revenue ({e.org.currency})</p>
                          <p className="font-semibold text-gray-200 tabular-nums">{fmtLocal(e.period.total, e.org.currency)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Revenue (MYR)</p>
                          <p className="font-semibold text-white tabular-nums">{fmtMyr(e.period.totalMyr)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Collection Rate</p>
                          <p className={`font-semibold tabular-nums ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                            {fmtPct(pct)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">DSO</p>
                          <p className={`font-semibold tabular-nums ${e.ratios.dso <= 30 ? 'text-emerald-400' : e.ratios.dso <= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                            {fmtDays(e.ratios.dso)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Outstanding</p>
                          <p className="font-semibold text-amber-400 tabular-nums">{fmtMyr(e.period.outstanding * e.org.fxToMyr)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Invoices</p>
                          <p className="font-semibold text-gray-300 tabular-nums">{e.period.count}</p>
                        </div>
                      </div>
                      {growth !== null && (
                        <div className={`mt-3 text-xs font-medium ${growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {fmtChange(growth)} vs {comparisonLabel}
                        </div>
                      )}
                      {e.topCustomers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          <p className="text-[10px] text-gray-600 mb-1">Top customers</p>
                          {e.topCustomers.slice(0, 3).map((c, ci) => (
                            <div key={c.name} className="flex justify-between text-[11px] mb-0.5">
                              <span className="text-gray-400 truncate flex-1 mr-2">
                                <span className="text-gray-600">{ci + 1}. </span>{c.name}
                              </span>
                              <span className="text-gray-300 tabular-nums flex-shrink-0">
                                {fmtLocal(c.total, e.org.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

      </main>

      <footer className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 text-center">
        <p className="text-xs text-gray-700">
          Hexamatics Group · Confidential financial data · {periodLabel} · Data from Zoho Books
        </p>
      </footer>
    </div>
  )
}
