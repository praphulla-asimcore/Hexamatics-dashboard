/**
 * Validates the `Authorization: Bearer <CRON_SECRET>` header used by Vercel
 * Cron and manual admin-triggered sync/warm calls.
 *
 * Fails closed: if CRON_SECRET isn't configured, no header can match —
 * `Bearer ${undefined}` must never be satisfiable by a literal
 * "Bearer undefined" header from a caller.
 */
export function isValidCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
