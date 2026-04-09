'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HexaLogo } from '@/components/HexaLogo'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setError('Invalid email or password')
    } else {
      const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
      router.push(callbackUrl)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <HexaLogo className="h-10" />
          </div>

          <h1 className="text-xl font-semibold text-white mb-1 text-center">
            Finance Dashboard
          </h1>
          <p className="text-sm text-gray-400 text-center mb-8">
            Sign in to access your analytics
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@hexamatics.com"
                required
                autoComplete="email"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-hexa-purple focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-hexa-purple focus:border-transparent transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-hexa-gradient hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Hexamatics Group · Confidential financial data
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
