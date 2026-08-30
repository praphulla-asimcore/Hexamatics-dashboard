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
          {/* Ambient Hexa-branded glow, hidden on print */}
          <div className="ambient-bg-layer print:hidden" aria-hidden="true">
            <div className="ambient-orb ambient-orb-purple" />
            <div className="ambient-orb ambient-orb-magenta" />
            <div className="ambient-orb ambient-orb-teal" />
            <div className="ambient-hex-grid" />
          </div>
          <div className="relative z-[1]">
            <SessionProvider>{children}</SessionProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
