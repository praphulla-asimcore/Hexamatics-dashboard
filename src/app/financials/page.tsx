import { NavBar } from '@/components/NavBar'
import { FinancialsClient } from '@/components/financials/FinancialsClient'

export const dynamic = 'force-dynamic'

export default async function FinancialsPage() {
  // Auth is handled by middleware
  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar />
      <FinancialsClient />
    </div>
  )
}
