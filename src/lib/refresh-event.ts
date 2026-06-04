/**
 * Cross-page sync coordination.
 *
 * After a "Sync Now" completes, all three pages must discard their in-memory
 * client caches and re-read the freshly-synced data. Two mechanisms:
 *
 *  1. Data version — a module-level counter shared by every page (same module
 *     instance across SPA navigation). Each page includes getDataVersion() in
 *     its client cache key, so bumping the version invalidates every cache at
 *     once, even for pages not currently mounted.
 *
 *  2. Refresh event — re-fetches the page that is currently mounted so the user
 *     sees fresh data immediately without navigating away.
 */

export const REFRESH_EVENT = 'hexamatics:refresh'

let _dataVersion = 0

export function getDataVersion(): number {
  return _dataVersion
}

export function bumpDataVersion() {
  _dataVersion++
}

export function dispatchRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
  }
}

export function onRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(REFRESH_EVENT, handler)
  return () => window.removeEventListener(REFRESH_EVENT, handler)
}
