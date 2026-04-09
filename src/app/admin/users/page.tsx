'use client'

import { useEffect, useState } from 'react'
import { HexaLogo } from '@/components/HexaLogo'

interface User {
  id: string; email: string; name: string; role: string; createdAt: string
}
interface Invite {
  token: string; email: string; name: string; role: string; expiresAt: string; invitedBy: string
}

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer' })
  const [inviteLink, setInviteLink] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => { setUsers(d.users || []); setInvites(d.invites || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMsg('')
    setInviteLink('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invite', ...form }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (data.error) { setMsg(`Error: ${data.error}`); return }
    setInviteLink(data.link)
    setMsg(`Invite created for ${form.email}`)
    setForm({ email: '', name: '', role: 'viewer' })
    load()
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Remove user ${name}?`)) return
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userId }),
    })
    load()
  }

  async function handleRevoke(token: string, email: string) {
    if (!confirm(`Revoke invite for ${email}?`)) return
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', token }),
    })
    load()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <HexaLogo className="h-8" />
          <div className="flex gap-3">
            <a href="/dashboard" className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition">
              ← Dashboard
            </a>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-8">User Management</h1>

        {/* Invite form */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-base font-semibold mb-4">Invite New User</h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-hexa-purple"
              />
              <input
                type="text"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-hexa-purple"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-hexa-purple"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-hexa-gradient rounded-lg text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Generate invite link'}
            </button>
          </form>

          {msg && <p className={`mt-3 text-sm ${msg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</p>}

          {inviteLink && (
            <div className="mt-3 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Share this link (expires in 7 days):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-hexa-purple break-all flex-1">{inviteLink}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="text-xs border border-gray-600 px-2 py-1 rounded hover:bg-gray-700 transition flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active users */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-base font-semibold mb-4">Active Users ({users.length})</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Name</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Email</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Role</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/50">
                    <td className="py-2.5 text-white">{u.name}</td>
                    <td className="py-2.5 text-gray-400">{u.email}</td>
                    <td className="py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-hexa-pink/20 text-hexa-pink' : 'bg-gray-700 text-gray-300'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {u.id !== 'admin' && (
                        <button
                          onClick={() => handleDelete(u.id, u.name)}
                          className="text-xs text-red-400 hover:text-red-300 transition"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending invites */}
        {invites.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-base font-semibold mb-4">Pending Invites ({invites.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Name</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Email</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Expires</th>
                  <th className="pb-2 text-left text-xs text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.token} className="border-b border-gray-800/50">
                    <td className="py-2.5 text-white">{inv.name}</td>
                    <td className="py-2.5 text-gray-400">{inv.email}</td>
                    <td className="py-2.5 text-gray-500 text-xs">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)}
                        className="text-xs text-hexa-purple hover:text-hexa-pink transition"
                      >
                        Copy link
                      </button>
                      <button
                        onClick={() => handleRevoke(inv.token, inv.email)}
                        className="text-xs text-red-400 hover:text-red-300 transition"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
