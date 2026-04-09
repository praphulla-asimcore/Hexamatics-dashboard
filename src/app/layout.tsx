import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/SessionProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hexamatics Group — Finance Dashboard',
  description: 'Multi-entity CFO analytics dashboard powered by Zoho Books',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
