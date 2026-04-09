// ─── Org Config ───────────────────────────────────────────────────────────────

export interface OrgConfig {
  id: string
  name: string
  short: string
  currency: string
  country: string
  fxToMyr: number
}

// ─── Zoho API types ───────────────────────────────────────────────────────────

export interface ZohoInvoice {
  invoice_id: string
  invoice_number: string
  customer_name: string
  status: 'paid' | 'overdue' | 'sent' | 'draft' | 'void' | 'partially_paid' | 'viewed' | 'approved'
  date: string        // yyyy-mm-dd
  due_date: string
  total: number
  balance: number
  currency_code: string
  exchange_rate: number
}

export interface ZohoTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// ─── Period definitions ───────────────────────────────────────────────────────

export type PeriodMode = 'month' | 'quarter' | 'ytd'

export interface PeriodDef {
  mode: PeriodMode
  year: number
  month?: number           // 1–12 for mode='month'
  quarter?: 1 | 2 | 3 | 4 // for mode='quarter'
  // ytd: Jan to last complete month of year
}

// ─── Financial data types ─────────────────────────────────────────────────────

export interface PeriodSummary {
  count: number
  total: number       // local currency
  collected: number
  outstanding: number
  totalMyr: number    // MYR equivalent
  statusBreakdown: Record<string, number>
}

export interface MonthDataPoint {
  year: number
  month: number       // 1–12
  totalLocal: number
  totalMyr: number
  collected: number
  outstanding: number
  count: number
}

export interface FinancialRatios {
  collectionRate: number    // 0–100 (%)
  dso: number               // days sales outstanding
  overdueRatio: number      // 0–100 (overdue AR / total AR)
  topCustomerConc: number   // 0–100 (top customer / total revenue)
  avgInvoiceValue: number   // local currency
}

export interface ArAging {
  current: number       // not yet due
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
}

export interface TopCustomer {
  name: string
  total: number
  outstanding: number
  invoiceCount: number
}

export interface EntitySummary {
  org: OrgConfig
  period: PeriodSummary
  comparison?: PeriodSummary  // previous period for MoM / QoQ
  arAging: ArAging
  topCustomers: TopCustomer[]
  ratios: FinancialRatios
  monthlyTrend: MonthDataPoint[]  // up to 12 months ending at period
}

export interface GroupSummary {
  totalMyr: number
  collectedMyr: number
  outstandingMyr: number
  collectionRate: number
  invoiceCount: number
  comparisonTotalMyr?: number
  comparisonCollectionRate?: number
}

export interface DashboardData {
  entities: EntitySummary[]
  group: GroupSummary
  periodLabel: string
  comparisonLabel: string
  lastRefreshed: string
  dateRange: { from: string; to: string }
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export interface AppUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'viewer'
  passwordHash: string
  createdAt: string
}

export interface InviteToken {
  token: string
  email: string
  name: string
  role: 'admin' | 'viewer'
  expiresAt: string
  invitedBy: string
}

export interface UsersStore {
  users: AppUser[]
  invites: InviteToken[]
}

// Kept for legacy cache compat
export interface CacheEntry {
  data: DashboardData
  cachedAt: number
}
