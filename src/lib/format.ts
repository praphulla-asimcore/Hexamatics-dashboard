const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtMyr(n: number, compact = true): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `MYR ${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000) return `MYR ${(n / 1_000).toFixed(1)}K`
    return `MYR ${n.toFixed(0)}`
  }
  return `MYR ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtLocal(n: number, currency: string, compact = true): string {
  if (!compact) {
    return `${currency} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (currency === 'IDR') {
    if (Math.abs(n) >= 1_000_000_000) return `${currency} ${(n / 1_000_000_000).toFixed(2)}B`
    if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`
  return `${currency} ${n.toFixed(0)}`
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`
}

export function fmtChange(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

export function fmtDays(n: number): string {
  return `${n.toFixed(0)}d`
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`
}

// ─── Color helpers ────────────────────────────────────────────────────────────

export function collectionColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 70) return 'text-amber-500'
  return 'text-red-500'
}

export function collectionBg(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

export function dsoColor(days: number): string {
  if (days <= 30) return 'text-emerald-600'
  if (days <= 60) return 'text-amber-500'
  return 'text-red-500'
}

export function overdueColor(pct: number): string {
  if (pct <= 20) return 'text-emerald-600'
  if (pct <= 50) return 'text-amber-500'
  return 'text-red-500'
}

export function growthColor(pct: number): string {
  if (pct > 0) return 'text-emerald-600'
  if (pct === 0) return 'text-gray-500'
  return 'text-red-500'
}

// HEXA brand gradient entity colors (9 entities: pink → blue)
export const ENTITY_COLORS = [
  '#E8177A', // Servcomm MY
  '#C219A0', // Singapore
  '#A019C8', // Nepal
  '#8519E0', // Indonesia
  '#6525E8', // Philippines
  '#4835E8', // Myanmar
  '#3045E8', // Bangladesh
  '#1855E8', // HexaHR
  '#1B1BE8', // Hexa Consulting
]
