import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getCachedDashboard } from '@/lib/cache'
import { getDefaultPeriod } from '@/lib/zoho-data'
import { DashboardClient } from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const period = getDefaultPeriod()
  const data = await getCachedDashboard(period)

  return <DashboardClient initialData={data} initialPeriod={period} />
}
