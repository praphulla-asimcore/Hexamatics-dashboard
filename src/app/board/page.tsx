import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCachedGroupSummary } from '@/lib/cache'
import { fmtMyr, fmtPct } from '@/lib/format'

export const dynamic = 'force-dynamic'

async function checkAuth() {
  const cookieStore = cookies()
  return cookieStore.get('board_auth')?.value === 'true'
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: { password?: string }
}) {
  // Simple password gate
  const isAuthed = await checkAuth()
  const password = searchParams.password

  if (!isAuthed && password !== process.env.DASHBOARD_PASSWORD) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mb-6">
            <span className="text-white text-sm font-bold">HG</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Board View</h1>
          <p className="text-sm text-gray-500 mb-6">Enter the access password to continue</p>
          <form action="/board" method="GET">
            <input
              type="password"
              name="password"
              placeholder="Password"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    )
  }

  const data = await getCachedGroupSummary(2026, [1, 2])
  const { group, entities } = data
  const momPct = group.jan > 0 ? ((group.feb - group.jan) / group.jan) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">HG</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Hexamatics Group</h1>
              <p className="text-xs text-gray-400">Financial Performance — Jan & Feb 2026</p>
            </div>
          </div>
          <a href="/dashboard" className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
            Full Dashboard
          </a>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Group YTD Revenue', value: fmtMyr(group.ytd), sub: 'Jan + Feb 2026' },
            { label: 'February Revenue', value: fmtMyr(group.feb), sub: `${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}% vs Jan` },
            { label: 'January Revenue', value: fmtMyr(group.jan), sub: '9 entities' },
            { label: 'Collection Rate', value: fmtPct(group.collectionRate), sub: `${fmtMyr(group.outstanding)} outstanding` },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Entity table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">Entity performance (MYR equivalent)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="pb-2 text-left text-xs font-medium text-gray-500">Entity</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Jan</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Feb</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">YTD</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">Collection</th>
              </tr>
            </thead>
            <tbody>
              {entities
                .filter((e) => e.ytd.totalMyr > 0)
                .sort((a, b) => b.ytd.totalMyr - a.ytd.totalMyr)
                .map((e) => {
                  const pct = e.ytd.total > 0 ? (e.ytd.collected / e.ytd.total) * 100 : 0
                  return (
                    <tr key={e.org.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-2.5 text-gray-200">{e.org.short}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-400">{fmtMyr(e.jan.totalMyr)}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-400">{fmtMyr(e.feb.totalMyr)}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-white">{fmtMyr(e.ytd.totalMyr)}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span className={`text-xs font-medium ${pct >= 90 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {fmtPct(pct)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-600 mt-6 text-center">
          Auto-refreshes every 30 min · Zoho Books live data · Last updated {new Date(data.lastRefreshed).toLocaleString('en-MY')}
        </p>
      </div>
    </div>
  )
}
