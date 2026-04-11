import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
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
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Don't block the page render on Zoho data — let the client fetch it.
  // This avoids Vercel's 10s serverless timeout on cold-start data fetches.
  const period = getDefaultPeriod()

  return <DashboardClient initialData={emptyDashboard() as any} initialPeriod={period} />
}
