'use client'

import { useState, useCallback, useEffect } from 'react'
import type { DashboardData, PeriodDef } from '@/types'
import { fmtMyr, dsoColor } from '@/lib/format'
import { KpiCard } from './KpiCard'
import { NavBar } from './NavBar'
import { PeriodSelector } from './PeriodSelector'

interface Props {
  initialData: DashboardData
  initialPeriod: PeriodDef
}

// ─── Health Status ────────────────────────────────────────────────────────────

type HealthLevel = 'excellent' | 'healthy' | 'caution' | 'critical'

interface HealthMetric {
  label: string
  value: string
  level: HealthLevel
  details: string
}

function getHealthLevel(metric: 'collection' | 'dso' | 'growth', value: number): HealthLevel {
  if (metric === 'collection') {
    if (value >= 95) return 'excellent'
    if (value >= 85) return 'healthy'
    if (value >= 70) return 'caution'
    return 'critical'
  }
  if (metric === 'dso') {
    if (value <= 25) return 'excellent'
    if (value <= 45) return 'healthy'
    if (value <= 60) return 'caution'
    return 'critical'
  }
  if (metric === 'growth') {
    if (value >= 20) return 'excellent'
    if (value >= 5) return 'healthy'
    if (value >= -5) return 'caution'
    return 'critical'
  }
  return 'healthy'
}

function getHealthBgColor(level: HealthLevel): string {
  switch (level) {
    case 'excellent': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
    case 'healthy': return 'bg-blue-500/10 border-blue-500/30 text-blue-300'
    case 'caution': return 'bg-amber-500/10 border-amber-500/30 text-amber-300'
    case 'critical': return 'bg-red-500/10 border-red-500/30 text-red-300'
  }
}

function getHealthDot(level: HealthLevel): string {
  switch (level) {
    case 'excellent': return 'bg-emerald-500'
    case 'healthy': return 'bg-blue-500'
    case 'caution': return 'bg-amber-500'
    case 'critical': return 'bg-red-500'
  }
}

export function ExecutiveSummaryClient({ initialData, initialPeriod }: Props) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [period, setPeriod] = useState<PeriodDef>(initialPeriod)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async (p: PeriodDef) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        mode: p.mode,
        year: String(p.year),
        ...(p.month ? { month: String(p.month) } : {}),
        ...(p.quarter ? { quarter: String(p.quarter) } : {}),
        ...(p.half ? { half: String(p.half) } : {}),
        comparison: p.comparison ?? 'previous',
      })
      const res = await fetch(`/api/zoho/dashboard?${params}`)
      const json = await res.json()
      if (!json.error) {
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePeriodChange = useCallback((p: PeriodDef) => {
    setPeriod(p)
    fetchData(p)
  }, [fetchData])

  useEffect(() => {
    // Auto-fetch on component mount if initial data is empty
    if (!data.entities.length) {
      fetchData(initialPeriod)
    }
  }, [])

  // ─── Compute Health Indicators ────────────────────────────────────────

  const collectionRate = data.group.collectionRate
  const healthCollection = getHealthLevel('collection', collectionRate)

  const weightedDso = data.entities.length > 0
    ? data.entities.reduce((s, e) => s + (e.ratios.dso * e.period.totalMyr), 0)
      / (data.entities.reduce((s, e) => s + e.period.totalMyr, 0) || 1)
    : 0
  const healthDso = getHealthLevel('dso', weightedDso)

  const growthRate = data.group.comparisonTotalMyr
    ? ((data.group.totalMyr - data.group.comparisonTotalMyr) / data.group.comparisonTotalMyr) * 100
    : 0
  const healthGrowth = data.group.totalMyr > 0 ? getHealthLevel('growth', growthRate) : 'healthy'

  // ─── Summary metrics ──────────────────────────────────────────────────

  const totalRevenue = data.group.totalMyr
  const collected = data.group.collectedMyr
  const outstanding = data.group.outstandingMyr
  const numEntities = data.entities.length
  const totalInvoices = data.group.invoiceCount

  const healthMetrics: HealthMetric[] = [
    {
      label: 'Collection Rate',
      value: `${collectionRate.toFixed(1)}%`,
      level: healthCollection,
      details: `${(totalInvoices * collectionRate / 100).toFixed(0)} of ${totalInvoices} invoices collected`,
    },
    {
      label: 'Days Sales Outstanding',
      value: `${weightedDso.toFixed(0)}d`,
      level: healthDso,
      details: `Weighted avg across ${numEntities} entities`,
    },
    {
      label: 'Revenue Growth',
      value: `${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%`,
      level: healthGrowth,
      details: `vs ${data.comparisonLabel}`,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar />

      {/* Executive Summary Header */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 print:py-4">
        <div className="mb-8 print:mb-4">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 print:text-2xl">Executive Summary</h1>
              <p className="text-gray-400 text-sm print:text-xs">
                {data.periodLabel} {data.comparisonLabel && `• Comparison: ${data.comparisonLabel}`}
              </p>
              {data.dateRange.from && (
                <p className="text-gray-500 text-xs mt-1 print:text-[10px]">
                  {data.dateRange.from} to {data.dateRange.to}
                </p>
              )}
            </div>
            <button
              onClick={() => window.print()}
              className="print:hidden px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition"
            >
              Print / Export PDF
            </button>
          </div>
          <div className="print:hidden">
            <PeriodSelector value={period} onChange={handlePeriodChange} loading={loading} />
          </div>
        </div>

        {/* Health Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 print:gap-2 print:mb-4">
          {healthMetrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-lg border p-4 print:p-2 flex items-start gap-3 ${getHealthBgColor(metric.level)}`}
            >
              <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${getHealthDot(metric.level)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium opacity-75 print:text-[10px]">{metric.label}</p>
                <p className="text-2xl font-bold mt-1 print:text-lg print:mt-0.5">{metric.value}</p>
                <p className="text-xs opacity-60 mt-1 print:text-[9px] print:mt-0.5">{metric.details}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Key Financial Metrics */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 print:p-3 mb-8 print:mb-4">
          <h2 className="text-lg font-semibold text-white mb-4 print:text-sm print:mb-2">
            Group Financial Summary
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:gap-2 print:grid-cols-4">
            <KpiCard
              label="Total Revenue"
              value={fmtMyr(totalRevenue)}
              highlight
              trend="up"
            />
            <KpiCard
              label="Collected"
              value={fmtMyr(collected)}
              sub={`${collectionRate.toFixed(1)}% collection rate`}
              trend={collectionRate >= 85 ? 'up' : 'warn'}
            />
            <KpiCard
              label="Outstanding AR"
              value={fmtMyr(outstanding)}
              sub={`${((outstanding / totalRevenue) * 100).toFixed(1)}% of revenue`}
            />
            <KpiCard
              label="Entities"
              value={numEntities.toString()}
              sub={`${totalInvoices.toLocaleString()} invoices`}
            />
          </div>
        </div>

        {/* Entity Breakdown */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden print:text-xs">
          <div className="p-6 print:p-3 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white print:text-sm">
              Performance by Entity
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[11px]">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/50">
                  <th className="px-6 py-3 text-left font-semibold text-gray-300 print:px-2 print:py-1">
                    Entity
                  </th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-300 print:px-2 print:py-1">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-300 print:px-2 print:py-1">
                    Collected
                  </th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-300 print:px-2 print:py-1">
                    Collection %
                  </th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-300 print:px-2 print:py-1">
                    DSO
                  </th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-300 print:px-2 print:py-1">
                    AR Aging 90+
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entities.map((entity) => {
                  const collRate = entity.period.total > 0 ? (entity.period.collected / entity.period.total) * 100 : 0
                  const aging90plus = ((entity.arAging.days90plus * entity.org.fxToMyr) / (entity.period.totalMyr || 1)) * 100

                  return (
                    <tr key={entity.org.id} className="border-b border-gray-800 hover:bg-gray-800/30 print:break-inside-avoid">
                      <td className="px-6 py-3 font-medium text-white print:px-2 print:py-1">
                        {entity.org.name}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-300 print:px-2 print:py-1">
                        {fmtMyr(entity.period.totalMyr)}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-300 print:px-2 print:py-1">
                        {fmtMyr(entity.period.collected * entity.org.fxToMyr)}
                      </td>
                      <td className={`px-6 py-3 text-right font-semibold print:px-2 print:py-1 ${
                        collRate >= 85 ? 'text-emerald-400' : collRate >= 70 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {collRate.toFixed(1)}%
                      </td>
                      <td className={`px-6 py-3 text-right font-semibold print:px-2 print:py-1 ${dsoColor(entity.ratios.dso)}`}>
                        {entity.ratios.dso.toFixed(0)}d
                      </td>
                      <td className={`px-6 py-3 text-right font-semibold print:px-2 print:py-1 ${
                        aging90plus >= 20 ? 'text-red-400' : aging90plus >= 10 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {aging90plus.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Insights Footer */}
        <div className="mt-8 pt-6 border-t border-gray-800 print:mt-4 print:pt-2 print:border-t print:border-gray-600">
          <p className="text-xs text-gray-500 print:text-[9px]">
            Last refreshed: {new Date(data.lastRefreshed).toLocaleString('en-MY', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
          <p className="text-xs text-gray-600 mt-2 print:text-[9px] print:mt-1">
            This executive summary auto-refreshes every 30 minutes. For detailed analysis, see Financial Statements and AR Dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
