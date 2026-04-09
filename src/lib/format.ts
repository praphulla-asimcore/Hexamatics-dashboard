/**
 * Format a number as MYR — e.g. "MYR 1.23M" or "MYR 450,000"
 */
export function fmtMyr(n: number, compact = true): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `MYR ${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000) return `MYR ${(n / 1_000).toFixed(1)}K`
    return `MYR ${n.toFixed(0)}`
  }
  return `MYR ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format a number in its local currency (compact)
 */
export function fmtLocal(n: number, currency: string): string {
  if (currency === 'IDR') {
    if (Math.abs(n) >= 1_000_000_000) return `${currency} ${(n / 1_000_000_000).toFixed(2)}B`
    if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`
  return `${currency} ${n.toFixed(0)}`
}

/**
 * Format a percentage
 */
export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

/**
 * Collection rate color class
 */
export function collectionColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function collectionBg(pct: number): string {
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}
