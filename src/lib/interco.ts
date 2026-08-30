/**
 * Intercompany (Interco) matrix — country-by-country AR between Hexamatics
 * entities.
 *
 *   Rows    = CREDITOR  (entity that issued the invoice / is owed)
 *   Columns = DEBTOR    (counterparty entity that owes)
 *   Cell    = { outstandingMyr, totalMyr } in MYR
 *
 * The creditor country comes from the issuing org (ORG_MAP). The debtor
 * country is resolved from the interco customer_name (which is another
 * Hexamatics entity, with many spelling / currency-suffix variants).
 */

import type { IntercoMatrix, IntercoMatrixCell } from '@/types'

export const COUNTRY_LABELS: Record<string, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
  ID: 'Indonesia',
  PH: 'Philippines',
  MM: 'Myanmar',
  NP: 'Nepal',
}

// Fixed display order for the matrix axes
const COUNTRY_ORDER = ['MY', 'SG', 'ID', 'PH', 'MM', 'NP']

/**
 * Maps an interco counterparty customer name to its country code.
 * Order matters — more specific checks first (e.g. "consulting services"
 * = Malaysia holding co, before "consulting inc" = Philippines).
 */
export function getCounterpartyCountry(customerName: string): string | null {
  const n = customerName.trim().toLowerCase()
  if (n.includes('servcomm'))            return 'MY'
  if (n.includes('consulting services')) return 'MY' // Hexa Consulting Services Sdn Bhd
  if (n.includes('hexahr'))              return 'MY'
  if (n.includes('singapore'))           return 'SG'
  if (n.includes('info tech') || n.includes('infotech')) return 'ID'
  if (n.includes('consulting inc'))      return 'PH' // Hexamatics Consulting Inc
  if (n.includes('myanmar'))             return 'MM'
  if (n.includes('nepal'))               return 'NP'
  return null
}

export interface IntercoItem {
  creditorCountry: string
  debtorCountry:   string
  outstandingMyr:  number
  totalMyr:        number
}

const emptyCell = (): IntercoMatrixCell => ({ outstandingMyr: 0, totalMyr: 0, invoiceCount: 0 })

export function buildIntercoMatrix(items: IntercoItem[]): IntercoMatrix {
  // Determine which countries actually appear (as creditor or debtor)
  const present = new Set<string>()
  for (const it of items) {
    present.add(it.creditorCountry)
    present.add(it.debtorCountry)
  }
  const countries = COUNTRY_ORDER
    .filter((c) => present.has(c))
    .map((code) => ({ code, label: COUNTRY_LABELS[code] ?? code }))

  const cells:     Record<string, Record<string, IntercoMatrixCell>> = {}
  const rowTotals: Record<string, IntercoMatrixCell> = {}
  const colTotals: Record<string, IntercoMatrixCell> = {}
  const grandTotal: IntercoMatrixCell = emptyCell()

  for (const { code } of countries) {
    cells[code] = {}
    for (const { code: d } of countries) cells[code][d] = emptyCell()
    rowTotals[code] = emptyCell()
    colTotals[code] = emptyCell()
  }

  for (const it of items) {
    const cell = cells[it.creditorCountry]?.[it.debtorCountry]
    if (!cell) continue
    cell.outstandingMyr += it.outstandingMyr
    cell.totalMyr       += it.totalMyr
    cell.invoiceCount   += 1

    const rt = rowTotals[it.creditorCountry]
    rt.outstandingMyr += it.outstandingMyr
    rt.totalMyr       += it.totalMyr
    rt.invoiceCount   += 1

    const ct = colTotals[it.debtorCountry]
    ct.outstandingMyr += it.outstandingMyr
    ct.totalMyr       += it.totalMyr
    ct.invoiceCount   += 1

    grandTotal.outstandingMyr += it.outstandingMyr
    grandTotal.totalMyr       += it.totalMyr
    grandTotal.invoiceCount   += 1
  }

  return { countries, cells, rowTotals, colTotals, grandTotal }
}
