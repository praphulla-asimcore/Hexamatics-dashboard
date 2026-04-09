'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { HexaLogo } from '@/components/HexaLogo'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<{ email: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/accept-invite?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setInvite(d)
      })
      .catch(() => setError('Failed to load invite'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }

    // Auto sign in
    await signIn('credentials', {
      email: invite!.email,
      password,
      redirect: false,
    })
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <a href="/login" className="text-hexa-purple text-sm hover:underline">Go to login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <div className="flex justify-center mb-8">
            <HexaLogo className="h-10" />
          </div>

          {done ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-emerald-400 text-xl">✓</span>
              </div>
              <p className="text-white font-medium">Account created!</p>
              <p className="text-gray-400 text-sm mt-1">Redirecting to dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white mb-1 text-center">Set your password</h1>
              {invite && (
                <p className="text-sm text-gray-400 text-center mb-8">
                  Welcome, <span className="text-white">{invite.name}</span>
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={invite?.email ?? ''}
                    disabled
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-hexa-purple"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-hexa-purple"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !invite}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-hexa-gradient hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? 'Creating account…' : 'Create account & sign in'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
