import { getCachedGroupSummary } from '@/lib/cache'
import { DashboardClient } from '@/components/DashboardClient'
import { RefreshButton } from '@/components/RefreshButton'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getCachedGroupSummary(2026, [1, 2])
  const lastRefreshed = format(new Date(data.lastRefreshed), 'dd MMM yyyy, HH:mm')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">HG</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">
              Hexamatics Group — Finance Dashboard
            </span>
            <span className="hidden sm:block text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Jan – Feb 2026
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400">
              Last updated {lastRefreshed}
            </span>
            <RefreshButton />
            <a
              href="/board"
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors"
            >
              Board view
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DashboardClient data={data} />
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 text-center">
        <p className="text-xs text-gray-400">
          Live data from Zoho Books · FX rates are indicative (SGD 3.35, IDR 0.000284, PHP 0.077, MMK 0.00214, BDT 0.038, NPR 0.0284 per MYR) ·
          Excludes Karya Indah Sdn Bhd and Datacrats Sdn Bhd ·
          Auto-refreshes every 30 min via Vercel Cron
        </p>
      </footer>
    </div>
  )
}
