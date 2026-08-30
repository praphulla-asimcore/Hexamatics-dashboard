'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { HexaLogo } from '@/components/HexaLogo'

const NAV_LINKS = [
  { href: '/financials',  label: 'Financial Statements' },
]

export function NavBar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <nav className="sticky top-0 z-50 bg-gray-950/70 backdrop-blur-2xl border-b border-white/[0.06] print:hidden">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/financials" className="flex-shrink-0">
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
                    ? 'bg-hexa-purple/15 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* User */}
        <div className="flex items-center gap-3">
          {session && (
            <>
              <span className="text-xs text-gray-500 hidden sm:block">
                {session.user?.name ?? session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-xs text-gray-500 hover:text-gray-200 transition"
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
