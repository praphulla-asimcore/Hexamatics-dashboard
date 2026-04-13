'use client'

// This page is the second leg of the SSO handoff.
// accept-launch redirects here with the session token in the URL hash (#).
// We read the hash client-side, POST it to /api/auth/set-session (same-origin),
// and the server sets the httpOnly cookie. Same-origin POST cookies are never
// blocked by browsers — this bypasses all cross-site cookie restrictions.

import { useEffect, useState } from 'react'

export default function AuthComplete() {
  const [status, setStatus] = useState('Completing sign-in…')

  useEffect(() => {
    const hash = window.location.hash.slice(1) // remove leading #
    const params = new URLSearchParams(window.location.search)
    const to = params.get('to') || '/dashboard'

    if (!hash) {
      setStatus('No session token — redirecting to login…')
      setTimeout(() => { window.location.replace('https://www.hexamatics.finance/login') }, 1500)
      return
    }

    const token = decodeURIComponent(hash)

    fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`set-session returned ${res.status}`)
        return res.json()
      })
      .then(() => {
        window.location.replace(to)
      })
      .catch((err) => {
        setStatus(`Authentication failed: ${err.message}`)
        setTimeout(() => { window.location.replace('https://www.hexamatics.finance/login') }, 2000)
      })
  }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#030712', color: '#9ca3af',
      fontFamily: 'system-ui, sans-serif', fontSize: '14px',
    }}>
      <p>{status}</p>
    </div>
  )
}
