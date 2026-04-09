'use client'

import { useState } from 'react'
import type { GroupSummary, EntitySummary } from '@/types'
import { fmtMyr, fmtLocal, fmtPct, collectionColor, collectionBg } from '@/lib/format'
import { KpiCard } from './KpiCard'
import { RevenueBarChart } from './charts/RevenueBarChart'
import { MonthlyCompareChart } from './charts/MonthlyCompareChart'
import { StatusDonutChart } from './charts/StatusDonutChart'
import { ArAgingChart } from './charts/ArAgingChart'
import { EntityTable } from './EntityTable'
import { CollectionsPanel } from './CollectionsPanel'
import { TopCustomersPanel } from './TopCustomersPanel'

interface Props {
  data: GroupSummary
}

type Tab = 'overview' | 'collections' | 'entities' | 'customers'

export function DashboardClient({ data }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { group, entities } = data

  const momChange = group.jan > 0
    ? ((group.feb - group.jan) / group.jan) * 100
    : 0

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'collections', label: 'Collections & AR Aging' },
    { key: 'entities', label: 'Entity Detail' },
    { key: 'customers', label: 'Top Customers' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Group YTD Revenue"
          value={fmtMyr(group.ytd)}
          sub="Jan + Feb 2026 · 9 entities"
          highlight
        />
        <KpiCard
          label="February Revenue"
          value={fmtMyr(group.feb)}
          sub={`${momChange >= 0 ? '+' : ''}${fmtPct(momChange)} vs January`}
          trend={momChange >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="January Revenue"
          value={fmtMyr(group.jan)}
          sub="Group total"
        />
        <KpiCard
          label="Collection Rate"
          value={fmtPct(group.collectionRate)}
          sub={`${fmtMyr(group.outstanding)} outstanding`}
          trend={group.collectionRate >= 90 ? 'up' : 'warn'}
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                Revenue by entity — YTD (MYR equivalent)
              </h3>
              <RevenueBarChart entities={entities} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                Jan vs Feb — group monthly
              </h3>
              <MonthlyCompareChart jan={group.jan} feb={group.feb} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                Invoice status mix — all entities YTD
              </h3>
              <StatusDonutChart entities={entities} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                AR aging — outstanding balance breakdown
              </h3>
              <ArAgingChart entities={entities} />
            </div>
          </div>

          {/* Collections health mini cards */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Collections health — entity view
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {entities
                .filter((e) => e.ytd.total > 0)
                .map((e) => {
                  const pct = e.ytd.total > 0
                    ? (e.ytd.collected / e.ytd.total) * 100
                    : 0
                  return (
                    <div key={e.org.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-xs text-gray-500 truncate">{e.org.short}</p>
                      <p className={`text-lg font-semibold tabular-nums ${collectionColor(pct)}`}>
                        {fmtPct(pct)}
                      </p>
                      <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${collectionBg(pct)}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1 tabular-nums">
                        {fmtLocal(e.ytd.outstanding, e.org.currency)} out
                      </p>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <CollectionsPanel entities={entities} />
      )}

      {/* Entity Detail Tab */}
      {activeTab === 'entities' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-500 mb-4">
            Full entity breakdown — Jan & Feb 2026
          </h3>
          <EntityTable entities={entities} />
        </div>
      )}

      {/* Top Customers Tab */}
      {activeTab === 'customers' && (
        <TopCustomersPanel entities={entities} />
      )}
    </div>
  )
}
