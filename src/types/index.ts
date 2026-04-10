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
  date: string
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

export type PeriodMode =
  | 'month'      // single month
  | 'quarter'    // Q1–Q4
  | 'half'       // H1 (Jan–Jun) or H2 (Jul–Dec)
  | 'year'       // full calendar year
  | 'ytd'        // Jan to current/last month
  | 'rolling12'  // trailing 12 months

export type ComparisonMode =
  | 'previous'   // immediately preceding period
  | 'yoy'        // same period prior year
  | 'none'       // no comparison

export interface PeriodDef {
  mode: PeriodMode
  year: number
  month?: number           // 1–12 (mode='month')
  quarter?: 1 | 2 | 3 | 4 // (mode='quarter')
  half?: 1 | 2             // (mode='half')
  comparison?: ComparisonMode
}

// ─── Financial data types ─────────────────────────────────────────────────────

export interface PeriodSummary {
  count: number
  total: number
  collected: number
  outstanding: number
  totalMyr: number
  statusBreakdown: Record<string, number>
}

export interface MonthDataPoint {
  year: number
  month: number
  totalLocal: number
  totalMyr: number
  collected: number
  outstanding: number
  count: number
}

export interface FinancialRatios {
  collectionRate: number
  dso: number
  overdueRatio: number
  topCustomerConc: number
  avgInvoiceValue: number
}

export interface ArAging {
  current: number
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
  comparison?: PeriodSummary
  arAging: ArAging
  topCustomers: TopCustomer[]
  ratios: FinancialRatios
  monthlyTrend: MonthDataPoint[]
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

// ─── Annual analytics ─────────────────────────────────────────────────────────

export interface AnnualEntityRow {
  orgId: string
  orgShort: string
  currency: string
  fxToMyr: number
  totalLocal: number
  totalMyr: number
  collectedMyr: number
  outstandingMyr: number
  count: number
  collectionRate: number
  dso: number
}

export interface AnnualYearData {
  year: number
  entities: AnnualEntityRow[]
  group: {
    totalMyr: number
    collectedMyr: number
    outstandingMyr: number
    collectionRate: number
    count: number
  }
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

export interface CacheEntry {
  data: DashboardData
  cachedAt: number
}
