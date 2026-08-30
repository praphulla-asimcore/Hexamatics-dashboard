import { redirect } from 'next/navigation'

// AR Dashboard is temporarily disabled — focus is on the Financial Statements page.
export default function DashboardPage() {
  redirect('/financials')
}
