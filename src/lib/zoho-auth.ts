import type { ZohoTokenResponse } from '@/types'

// In-memory token cache (per serverless instance)
let cachedToken: string | null = null
let tokenExpiry = 0

// In-flight refresh deduplication:
// If a refresh is already underway, all concurrent callers share the same
// promise instead of each firing their own request to Zoho's OAuth endpoint.
// Without this, Promise.all(9 entities) fires 9 simultaneous refresh calls
// and Zoho responds with "too many requests".
let refreshPromise: Promise<string> | null = null

const DC = process.env.ZOHO_DC || 'com'
const TOKEN_URL = `https://accounts.zoho.${DC}/oauth/v2/token`
const BOOKS_BASE = `https://www.zohoapis.${DC}/books/v3`

/**
 * Returns a valid Zoho access token, refreshing if needed.
 * Uses the refresh_token grant — no user interaction required.
 * Deduplicates concurrent refresh calls so only one hits the OAuth endpoint.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now()

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken
  }

  // If a refresh is already in-flight, wait for it instead of firing another
  if (refreshPromise) {
    return refreshPromise
  }

  // Start a new refresh and store the promise so concurrent callers can share it
  refreshPromise = (async () => {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      })

      const res = await fetch(`${TOKEN_URL}?${params}`, { method: 'POST' })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Zoho token refresh failed: ${res.status} ${body}`)
      }

      const data: ZohoTokenResponse = await res.json()

      if (!data.access_token) {
        throw new Error(`Zoho token response missing access_token: ${JSON.stringify(data)}`)
      }

      cachedToken = data.access_token
      tokenExpiry = Date.now() + data.expires_in * 1000
      return cachedToken
    } finally {
      // Clear the in-flight promise regardless of success or failure
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Typed fetch wrapper for Zoho Books API.
 * Automatically attaches the Authorization header.
 */
export async function zohoFetch<T = unknown>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(`${BOOKS_BASE}${path}`)

  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    // Vercel edge cache — revalidate every 5 minutes at CDN level
    next: { revalidate: 300 },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Zoho API error ${res.status} for ${path}: ${body}`)
  }

  return res.json() as Promise<T>
}

export { BOOKS_BASE }
