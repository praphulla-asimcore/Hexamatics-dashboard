import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getCachedDashboard } from '@/lib/cache'
import { getDefaultPeriod } from '@/lib/zoho-data'
import { fmtMyr, fmtPct, fmtChange, ENTITY_COLORS } from '@/lib/format'
import { HexaLogo } from '@/components/HexaLogo'

export const dynamic = 'force-dynamic'

export default async function BoardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const period = getDefaultPeriod()
  const data = await getCachedDashboard(period)
  const { group, entities, periodLabel, comparisonLabel } = data

  const revenueGrowth = group.comparisonTotalMyr && group.comparisonTotalMyr > 0
    ? ((group.totalMyr - group.comparisonTotalMyr) / group.comparisonTotalMyr) * 100
    : null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <HexaLogo className="h-8" />
            <div>
              <h1 className="text-sm font-semibold text-gray-200">Hexamatics Group — Board View</h1>
              <p className="text-xs text-gray-500">Financial Performance · {periodLabel}</p>
            </div>
          </div>
          <a href="/dashboard" className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition">
            Full Dashboard →
          </a>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: `Group Revenue · ${periodLabel}`,
              value: fmtMyr(group.totalMyr),
              sub: revenueGrowth !== null ? `${fmtChange(revenueGrowth)} vs ${comparisonLabel}` : '',
              accent: true,
            },
            {
              label: 'Collection Rate',
              value: fmtPct(group.collectionRate),
              sub: `${fmtMyr(group.outstandingMyr)} outstanding`,
            },
            {
              label: 'AR Outstanding',
              value: fmtMyr(group.outstandingMyr),
              sub: `${fmtPct((group.outstandingMyr / (group.totalMyr || 1)) * 100)} of billed`,
            },
            {
              label: 'Active Entities',
              value: String(entities.filter((e) => e.period.total > 0).length),
              sub: 'contributing revenue',
            },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-xl p-4 border ${kpi.accent ? 'border-hexa-purple/30 bg-hexa-purple/10' : 'border-gray-800 bg-gray-900'}`}>
              <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${kpi.accent ? 'text-transparent bg-clip-text bg-hexa-gradient-r' : 'text-white'}`}>
                {kpi.value}
              </p>
              {kpi.sub && <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>}
            </div>
          ))}
        </div>

        {/* Entity table */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Entity performance (MYR equivalent) · {periodLabel}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="pb-2 text-left text-xs font-medium text-gray-500">Entity</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Revenue</th>
                {comparisonLabel && <th className="pb-2 text-right text-xs font-medium text-gray-500">{comparisonLabel}</th>}
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Growth</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Collection</th>
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
                  const pct = e.ratios.collectionRate
                  return (
                    <tr key={e.org.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-2.5 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                        <span className="text-gray-200">{e.org.short}</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-white">{curr > 0 ? fmtMyr(curr) : '—'}</td>
                      {comparisonLabel && (
                        <td className="py-2.5 text-right tabular-nums text-gray-500">{prev > 0 ? fmtMyr(prev) : '—'}</td>
                      )}
                      <td className="py-2.5 text-right tabular-nums">
                        {growth !== null ? (
                          <span className={`text-sm font-medium ${growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtChange(growth)}
                          </span>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span className={`text-sm font-medium ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                          {fmtPct(pct)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-700 text-center">
          Live from Zoho Books · FX rates indicative · {new Date(data.lastRefreshed).toLocaleString('en-MY')}
        </p>
      </div>
    </div>
  )
}
