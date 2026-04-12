import { getDefaultPeriod } from '@/lib/zoho-data'
import { ExecutiveSummaryClient } from '@/components/ExecutiveSummaryClient'

export const dynamic = 'force-dynamic'

function emptyDashboard() {
  return {
    entities: [],
    group: {
      totalMyr: 0,
      collectedMyr: 0,
      outstandingMyr: 0,
      collectionRate: 0,
      invoiceCount: 0,
    },
    periodLabel: '',
    comparisonLabel: '',
    lastRefreshed: new Date().toISOString(),
    dateRange: { from: '', to: '' },
  }
}

export default async function ExecutivePage() {
  // Auth is handled by middleware
  const period = getDefaultPeriod()

  return <ExecutiveSummaryClient initialData={emptyDashboard() as any} initialPeriod={period} />
}
