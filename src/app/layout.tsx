import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/SessionProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hexamatics Group — Finance Dashboard',
  description: 'Multi-entity CFO analytics dashboard powered by Zoho Books',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeProvider adds/removes `dark` class
    // client-side after reading localStorage — mismatch is expected and benign.
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider>
          {/* Ambient background — light mode only, hidden via CSS in dark mode */}
          <div className="light-bg-layer" aria-hidden="true">
            <div className="light-orb light-orb-purple" />
            <div className="light-orb light-orb-magenta" />
            <div className="light-orb light-orb-teal" />
            <div className="light-hex-grid" />
          </div>
          <div className="relative z-[1]">
            <SessionProvider>{children}</SessionProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
