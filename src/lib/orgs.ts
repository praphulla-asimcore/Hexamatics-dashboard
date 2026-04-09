import type { OrgConfig } from '@/types'

// Excluded: Karya Indah (761483650), Datacrats (853265884)
export const ORGS: OrgConfig[] = [
  {
    id: '762447369',
    name: 'Hexamatics Servcomm Sdn Bhd',
    short: 'Servcomm (MY)',
    currency: 'MYR',
    country: 'MY',
    fxToMyr: 1.0,
  },
  {
    id: '753289306',
    name: 'Hexamatics Singapore Pte. Ltd',
    short: 'Singapore',
    currency: 'SGD',
    country: 'SG',
    fxToMyr: 3.35,
  },
  {
    id: '804163623',
    name: 'Hexamatics Nepal Pvt Ltd',
    short: 'Nepal',
    currency: 'NPR',
    country: 'NP',
    fxToMyr: 0.0284,
  },
  {
    id: '768662733',
    name: 'PT Hexamatics Info Tech',
    short: 'Indonesia (PT HIT)',
    currency: 'IDR',
    country: 'ID',
    fxToMyr: 0.000284,
  },
  {
    id: '768663054',
    name: 'Hexamatics Consulting Inc.',
    short: 'Philippines',
    currency: 'PHP',
    country: 'PH',
    fxToMyr: 0.077,
  },
  {
    id: '768663052',
    name: 'Hexamatics Myanmar Co Ltd',
    short: 'Myanmar',
    currency: 'MMK',
    country: 'MM',
    fxToMyr: 0.00214,
  },
  {
    id: '759722348',
    name: 'Hexamatic Bangladesh Ltd',
    short: 'Bangladesh',
    currency: 'BDT',
    country: 'BD',
    fxToMyr: 0.038,
  },
  {
    id: '883796614',
    name: 'HexaHR Sdn Bhd',
    short: 'HexaHR (MY)',
    currency: 'MYR',
    country: 'MY',
    fxToMyr: 1.0,
  },
  {
    id: '897668064',
    name: 'Hexa Consulting Services Sdn Bhd',
    short: 'Hexa Consulting (MY)',
    currency: 'MYR',
    country: 'MY',
    fxToMyr: 1.0,
  },
]

export const ORG_MAP = Object.fromEntries(ORGS.map(o => [o.id, o]))
