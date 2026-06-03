'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'
import { HexaLogo } from '@/components/HexaLogo'
import { dispatchRefresh } from '@/lib/refresh-event'

const NAV_LINKS = [
  { href: '/executive',   label: 'Executive Summary' },
  { href: '/dashboard',   label: 'AR Dashboard' },
  { href: '/financials',  label: 'Financial Statements' },
]

export function NavBar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    dispatchRefresh()
    setTimeout(() => setRefreshing(false), 3000)
  }

  return (
    <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-2xl border-b border-black/[0.07] print:hidden">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex-shrink-0">
          <HexaLogo className="h-7" />
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  active
                    ? 'bg-black/[0.06] text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-black/[0.04]'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Global Refresh + User */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh all dashboards — AR, Financial Statements, Executive Summary"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
              ${refreshing
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-600 hover:border-hexa-purple hover:text-hexa-purple hover:bg-purple-50/60'
              }`}
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh All'}
          </button>

          {session && (
            <>
              <span className="text-xs text-gray-500 hidden sm:block">
                {session.user?.name ?? session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
