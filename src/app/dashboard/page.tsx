import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getCachedDashboard } from '@/lib/cache'
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
    periodLabel: 'No Data',
    comparisonLabel: '',
    lastRefreshed: new Date().toISOString(),
    dateRange: { from: '', to: '' },
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const period = getDefaultPeriod()

  let data
  try {
    data = await getCachedDashboard(period)
  } catch {
    data = emptyDashboard() as any
  }

  return <DashboardClient initialData={data} initialPeriod={period} />
}
