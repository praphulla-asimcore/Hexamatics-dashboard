/**
 * Customer classification — sourced from Customer List.xlsx
 *
 * Three types:
 *   interco     — transactions between Hexamatics group entities
 *   rpt         — related party transactions (Karya Indah, Hexaconsult, Workspacing)
 *   third-party — external customers (default; drives main AR dashboard)
 *
 * Matching is case-insensitive and trims whitespace.
 * Any customer name not in the lists below defaults to 'third-party'.
 */

export type CustomerType = 'third-party' | 'interco' | 'rpt'

const INTERCO_NAMES = new Set([
  'hexamatics bangladesh ltd',
  'hexamatics servcomm sdn bhd-usd',
  'hexamatics singapore ptd ltd',
  'hexamatics singapore pte. ltd (usd)',
  'pt hexamatics infotech',
  'pt hexamatics infotech usd',
  'hexamatics servcomm sdn bhd',
  'hexamatics singapore pte. ltd',
  'hexa consulting services sdn bhd',
  'hexamatics consulting inc - usd',
  'hexamatics myanmar co. ltd.',
  'pt hexamatics info tech (usd)',
  'hexamatics consulting inc.',
  'hexamatics consulting inc. - ex. gain/loss',
  'hexamatics myanmar company ltd_usd',
  'hexamatics myanmar company ltd_usd - ex. gain/loss',
  'hexamatics servcomm sdn bhd_usd',
  'hexamatics servcomm sdn bhd_usd - ex. gain/loss',
  'hexamatics singapore pte. ltd_usd',
  'hexamatics singapore pte. ltd_usd - ex. gain/loss',
  'pt hexamatics info tech_usd',
  'pt hexamatics info tech_usd - ex. gain/loss',
  'hexamatics servcomm sdn. bhd.',   // note: contains non-breaking space
  'hexamatics singapore pte ltd.',
])

const RPT_NAMES = new Set([
  'karya indah sdn. bhd.',
  'hexaconsult sdn bhd',
  'hexaconsult sdn. bhd.',
  'workspacing pte ltd (singapore)',
])

/**
 * Returns the customer type for a given customer name.
 * Defaults to 'third-party' for any unknown name.
 */
export function getCustomerType(customerName: string): CustomerType {
  const key = customerName.trim().toLowerCase()
  if (INTERCO_NAMES.has(key)) return 'interco'
  if (RPT_NAMES.has(key))    return 'rpt'
  return 'third-party'
}

export function isThirdParty(customerName: string): boolean {
  return getCustomerType(customerName) === 'third-party'
}
