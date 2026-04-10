import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { NavBar } from '@/components/NavBar'
import { FinancialsClient } from '@/components/financials/FinancialsClient'

export const dynamic = 'force-dynamic'

export default async function FinancialsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar />
      <FinancialsClient />
    </div>
  )
}
