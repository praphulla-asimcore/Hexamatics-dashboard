import { getDefaultPeriod } from '@/lib/zoho-data'
import { DashboardClient } from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

function emptyDashboard() {
  return {
    entities: [],
    group: {
      totalMyr: 0, collectedMyr: 0, outstandingMyr: 0,
      collectionRate: 0, invoiceCount: 0,
    },
    periodLabel: '',
    comparisonLabel: '',
    lastRefreshed: new Date().toISOString(),
    dateRange: { from: '', to: '' },
  }
}

export default async function DashboardPage() {
  // Auth is handled by middleware — no getServerSession needed here
  const period = getDefaultPeriod()
  return <DashboardClient initialData={emptyDashboard() as any} initialPeriod={period} />
}
