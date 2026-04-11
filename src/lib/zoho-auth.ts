import type { ZohoTokenResponse } from '@/types'

// In-memory token cache (per serverless instance)
let cachedToken: string | null = null
let tokenExpiry = 0

// In-flight refresh deduplication — prevents N concurrent calls within
// one serverless instance from each firing a separate refresh request.
let refreshPromise: Promise<string> | null = null

const DC = process.env.ZOHO_DC || 'com'
const TOKEN_URL = `https://accounts.zoho.${DC}/oauth/v2/token`
const BOOKS_BASE = `https://www.zohoapis.${DC}/books/v3`

/**
 * Returns a valid Zoho access token, refreshing if needed.
 * - Deduplicates concurrent calls within one serverless instance.
 * - Retries up to 3 times with exponential backoff on rate-limit errors
 *   (Zoho returns 400 "too many requests" when the OAuth endpoint is hit
 *   by multiple serverless instances simultaneously).
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now()

  // Return cached token if still valid (60s buffer)
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken
  }

  // If a refresh is already in-flight in this instance, share it
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      return await refreshWithRetry()
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function refreshWithRetry(maxAttempts = 4): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      await sleep(1000 * Math.pow(2, attempt - 1))
    }

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
        const isRateLimit =
          res.status === 400 &&
          (body.includes('too many requests') || body.includes('Access Denied'))
        // Retry on rate limit; throw immediately on other errors
        if (isRateLimit && attempt < maxAttempts - 1) {
          lastError = new Error(`Zoho token refresh failed: ${res.status} ${body}`)
          console.warn(`Zoho rate limit hit (attempt ${attempt + 1}/${maxAttempts}), retrying…`)
          continue
        }
        throw new Error(`Zoho token refresh failed: ${res.status} ${body}`)
      }

      const data: ZohoTokenResponse = await res.json()

      if (!data.access_token) {
        throw new Error(`Zoho token response missing access_token: ${JSON.stringify(data)}`)
      }

      cachedToken = data.access_token
      tokenExpiry = Date.now() + data.expires_in * 1000
      return cachedToken
    } catch (err: any) {
      // Only retry on rate-limit-style errors
      if (
        attempt < maxAttempts - 1 &&
        err.message?.includes('too many requests')
      ) {
        lastError = err
        continue
      }
      throw err
    }
  }

  throw lastError ?? new Error('Zoho token refresh failed after retries')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Typed fetch wrapper for Zoho Books API.
 * Automatically attaches the Authorization header.
 * Retries on 429 rate-limit responses with exponential backoff.
 */
export async function zohoFetch<T = unknown>(
  path: string,
  params: Record<string, string> = {},
  maxAttempts = 4
): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(`${BOOKS_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s — Zoho says "blocked for some time"
      await sleep(2000 * Math.pow(2, attempt - 1))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      next: { revalidate: 300 },
    })

    if (res.status === 429 && attempt < maxAttempts - 1) {
      const body = await res.text()
      console.warn(`Zoho 429 on ${path} (attempt ${attempt + 1}/${maxAttempts}), retrying…`, body)
      continue
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Zoho API error ${res.status} for ${path}: ${body}`)
    }

    return res.json() as Promise<T>
  }

  throw new Error(`Zoho API ${path} failed after ${maxAttempts} attempts (rate limited)`)
}

export { BOOKS_BASE }
