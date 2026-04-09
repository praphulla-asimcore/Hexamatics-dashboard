// ─── Org Config ───────────────────────────────────────────────────────────────

export interface OrgConfig {
  id: string
  name: string
  short: string
  currency: string
  country: string
  fxToMyr: number // indicative rate to MYR
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

// ─── Dashboard Data ────────────────────────────────────────────────────────────

export interface PeriodSummary {
  count: number
  total: number         // local currency
  collected: number
  outstanding: number
  totalMyr: number      // MYR equivalent
  statusBreakdown: Record<string, number>
}

export interface EntitySummary {
  org: OrgConfig
  jan: PeriodSummary
  feb: PeriodSummary
  ytd: PeriodSummary
  arAging: ArAging
  topCustomers: TopCustomer[]
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

export interface GroupSummary {
  entities: EntitySummary[]
  group: {
    jan: number   // MYR
    feb: number
    ytd: number
    outstanding: number
    collectionRate: number
  }
  lastRefreshed: string  // ISO timestamp
  dateRange: {
    from: string
    to: string
  }
}

export interface CacheEntry {
  data: GroupSummary
  cachedAt: number  // epoch ms
}
