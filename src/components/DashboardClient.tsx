'use client'

import { useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { DashboardData, PeriodDef } from '@/types'
import { fmtMyr, fmtPct, fmtChange, fmtDays, collectionColor, growthColor, ENTITY_COLORS } from '@/lib/format'
import { HexaLogo } from './HexaLogo'
import { KpiCard } from './KpiCard'
import { PeriodSelector } from './PeriodSelector'
import { RevenueBarChart } from './charts/RevenueBarChart'
import { MonthlyCompareChart } from './charts/MonthlyCompareChart'
import { TrendLineChart } from './charts/TrendLineChart'
import { StatusDonutChart } from './charts/StatusDonutChart'
import { ArAgingChart } from './charts/ArAgingChart'
import { EntityTable } from './EntityTable'
import { FinancialRatiosTable } from './FinancialRatiosTable'

type Tab = 'overview' | 'revenue' | 'collections' | 'ratios' | 'entities'

interface Props {
  initialData: DashboardData
  initialPeriod: PeriodDef
}

function getDefaultPeriod(): PeriodDef {
  const now = new Date()
  return { mode: 'month', year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function DashboardClient({ initialData, initialPeriod }: Props) {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData>(initialData)
  const [period, setPeriod] = useState<PeriodDef>(initialPeriod)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const fetchData = useCallback(async (p: PeriodDef) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        mode: p.mode,
        year: String(p.year),
        ...(p.month ? { month: String(p.month) } : {}),
        ...(p.quarter ? { quarter: String(p.quarter) } : {}),
      })
      const res = await fetch(`/api/zoho/dashboard?${params}`)
      const json = await res.json()
      if (!json.error) setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePeriodChange = (p: PeriodDef) => {
    setPeriod(p)
    fetchData(p)
  }

  const handleRefresh = () => fetchData({ ...period })

  const { group, entities, periodLabel, comparisonLabel, lastRefreshed } = data

  const revenueGrowth = group.comparisonTotalMyr && group.comparisonTotalMyr > 0
    ? ((group.totalMyr - group.comparisonTotalMyr) / group.comparisonTotalMyr) * 100
    : null

  const collRateChange = group.comparisonCollectionRate !== undefined
    ? group.collectionRate - group.comparisonCollectionRate
    : null

  // Compute group DSO (weighted average)
  const activeEntities = entities.filter((e) => e.period.total > 0)
  const weightedDso = activeEntities.length > 0
    ? activeEntities.reduce((s, e) => s + e.ratios.dso * e.period.totalMyr, 0) /
      activeEntities.reduce((s, e) => s + e.period.totalMyr, 0)
    : 0

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'revenue', label: 'Revenue & Trends' },
    { key: 'collections', label: 'Collections & AR' },
    { key: 'ratios', label: 'Financial Ratios' },
    { key: 'entities', label: 'Entity Detail' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <HexaLogo className="h-7" />
            <span className="text-gray-600 text-sm hidden sm:block">|</span>
            <span className="text-gray-300 text-sm font-medium hidden sm:block">Finance Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:block text-xs text-gray-600">
              {session?.user?.name ?? session?.user?.email}
            </span>
            <button
              onClick={handleRefresh}
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
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <PeriodSelector value={period} onChange={handlePeriodChange} loading={loading} />
          <div className="text-xs text-gray-600">
            Updated {new Date(lastRefreshed).toLocaleString('en-MY', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── KPI Row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={`Group Revenue · ${periodLabel}`}
            value={fmtMyr(group.totalMyr)}
            sub={revenueGrowth !== null
              ? `${fmtChange(revenueGrowth)} vs ${comparisonLabel}`
              : `${entities.filter((e) => e.period.total > 0).length} active entities`}
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
            sub={group.totalMyr > 0
              ? `${fmtPct((group.outstandingMyr / group.totalMyr) * 100)} of billed`
              : 'No billed amount'}
            trend={group.outstandingMyr > group.totalMyr * 0.2 ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Group DSO"
            value={fmtDays(weightedDso)}
            sub={`${group.invoiceCount} invoices · ${periodLabel}`}
            trend={weightedDso <= 30 ? 'up' : weightedDso <= 60 ? 'warn' : 'down'}
          />
        </div>

        {/* ── Tab navigation ────────────────────────────────────────── */}
        <div className="border-b border-gray-800">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
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

        {/* ── Overview Tab ──────────────────────────────────────────── */}
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
                {entities
                  .filter((e) => e.period.total > 0)
                  .map((e, i) => {
                    const pct = e.ratios.collectionRate
                    const growth = e.comparison?.totalMyr
                      ? ((e.period.totalMyr - e.comparison.totalMyr) / e.comparison.totalMyr) * 100
                      : null
                    return (
                      <div key={e.org.id} className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: ENTITY_COLORS[i % ENTITY_COLORS.length] }}
                          />
                          <p className="text-xs text-gray-400 truncate">{e.org.short}</p>
                        </div>
                        <p className="text-base font-bold text-white tabular-nums">
                          {fmtMyr(e.period.totalMyr)}
                        </p>
                        <p className={`text-xs font-semibold tabular-nums mt-0.5 ${
                          pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {fmtPct(pct)} collected
                        </p>
                        <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444',
                            }}
                          />
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

        {/* ── Revenue & Trends Tab ──────────────────────────────────── */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">12-month revenue trend (MYR consolidated)</h3>
              <TrendLineChart entities={entities} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Revenue by entity — current vs previous</h3>
                <RevenueBarChart entities={entities} periodLabel={periodLabel} comparisonLabel={comparisonLabel} />
              </div>

              {/* QoQ / MoM summary table */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">
                  Period analysis — {periodLabel} vs {comparisonLabel || 'prior period'}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="pb-2 text-left text-xs text-gray-500">Entity</th>
                        <th className="pb-2 text-right text-xs text-gray-500">{periodLabel}</th>
                        {comparisonLabel && <th className="pb-2 text-right text-xs text-gray-500">{comparisonLabel}</th>}
                        <th className="pb-2 text-right text-xs text-gray-500">Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entities
                        .filter((e) => e.period.totalMyr > 0 || (e.comparison?.totalMyr ?? 0) > 0)
                        .sort((a, b) => b.period.totalMyr - a.period.totalMyr)
                        .map((e, i) => {
                          const curr = e.period.totalMyr
                          const prev = e.comparison?.totalMyr ?? 0
                          const growth = prev > 0 ? ((curr - prev) / prev) * 100 : null
                          return (
                            <tr key={e.org.id} className="border-b border-gray-800/50">
                              <td className="py-2 flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: ENTITY_COLORS[i % ENTITY_COLORS.length] }}
                                />
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
                            </tr>
                          )
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-700">
                        <td className="pt-2 text-xs font-semibold text-gray-400">Group</td>
                        <td className="pt-2 text-right tabular-nums font-bold text-white text-xs">
                          {fmtMyr(group.totalMyr)}
                        </td>
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
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Collections & AR Tab ──────────────────────────────────── */}
        {activeTab === 'collections' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">AR aging — {periodLabel}</h3>
                <ArAgingChart entities={entities} />
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-medium text-gray-500 mb-4">Invoice status mix</h3>
                <StatusDonutChart entities={entities} />
              </div>
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
                      <th className="pb-2 text-right text-xs text-gray-500">Overdue</th>
                      <th className="pb-2 text-right text-xs text-gray-500">90d+</th>
                      <th className="pb-2 text-right text-xs text-gray-500">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities
                      .filter((e) => e.period.total > 0)
                      .sort((a, b) => b.period.outstanding - a.period.outstanding)
                      .map((e, i) => {
                        const pct = e.ratios.collectionRate
                        const fx = e.org.fxToMyr
                        const aging = e.arAging
                        const overdueTotal = (aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.days90plus)
                        return (
                          <tr key={e.org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                            <td className="py-2.5 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ background: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                              <span className="text-gray-200 text-xs">{e.org.short}</span>
                            </td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-gray-300">{fmtMyr(e.period.totalMyr)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-emerald-400">{fmtMyr(e.period.collected * fx)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-amber-400">{fmtMyr(e.period.outstanding * fx)}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-gray-400">{aging.current > 0 ? fmtMyr(aging.current * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-orange-400">{overdueTotal > 0 ? fmtMyr(overdueTotal * fx) : '—'}</td>
                            <td className="py-2.5 text-right text-xs tabular-nums text-red-400">{aging.days90plus > 0 ? fmtMyr(aging.days90plus * fx) : '—'}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-xs font-semibold ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                                {fmtPct(pct)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
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
                      {e.topCustomers.slice(0, 5).map((c, i) => (
                        <div key={c.name} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate flex-1 mr-2">
                            <span className="text-gray-600 mr-1">{i + 1}.</span>
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

        {/* ── Financial Ratios Tab ──────────────────────────────────── */}
        {activeTab === 'ratios' && (
          <div className="space-y-6">
            {/* Summary ratio cards */}
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
                {(() => {
                  const totalAr = entities.reduce((s, e) => {
                    const ag = e.arAging
                    return s + (ag.current + ag.days1to30 + ag.days31to60 + ag.days61to90 + ag.days90plus) * e.org.fxToMyr
                  }, 0)
                  const overdueAr = entities.reduce((s, e) => {
                    const ag = e.arAging
                    return s + (ag.days1to30 + ag.days31to60 + ag.days61to90 + ag.days90plus) * e.org.fxToMyr
                  }, 0)
                  const pct = totalAr > 0 ? (overdueAr / totalAr) * 100 : 0
                  return (
                    <>
                      <p className={`text-2xl font-bold tabular-nums ${pct <= 20 ? 'text-emerald-400' : pct <= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {fmtPct(pct)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">{fmtMyr(overdueAr)} overdue</p>
                    </>
                  )
                })()}
              </div>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-1">90+ Days AR</p>
                {(() => {
                  const val = entities.reduce((s, e) => s + e.arAging.days90plus * e.org.fxToMyr, 0)
                  return (
                    <>
                      <p className={`text-2xl font-bold tabular-nums ${val === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtMyr(val)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Critical overdue</p>
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-medium text-gray-500 mb-4">Financial ratios by entity — {periodLabel}</h3>
              <FinancialRatiosTable entities={entities} />
            </div>
          </div>
        )}

        {/* ── Entity Detail Tab ─────────────────────────────────────── */}
        {activeTab === 'entities' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 className="text-xs font-medium text-gray-500 mb-4">Entity detail — {periodLabel}{comparisonLabel ? ` vs ${comparisonLabel}` : ''}</h3>
            <EntityTable
              entities={entities}
              periodLabel={periodLabel}
              comparisonLabel={comparisonLabel}
            />

            {/* FX rates footnote */}
            <p className="text-xs text-gray-700 mt-4">
              FX rates (indicative) — SGD: 3.35 · IDR: 0.000284 · PHP: 0.077 · MMK: 0.00214 · BDT: 0.038 · NPR: 0.0284 per MYR ·
              Live data from Zoho Books
            </p>
          </div>
        )}

      </main>

      <footer className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 text-center">
        <p className="text-xs text-gray-700">
          Hexamatics Group · Confidential financial data · Auto-refreshes every 30 min
        </p>
      </footer>
    </div>
  )
}
