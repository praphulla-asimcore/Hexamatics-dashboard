/**
 * Global refresh event — fired by NavBar Refresh button.
 * All dashboard pages listen for this and re-fetch with force=true.
 */

export const REFRESH_EVENT = 'hexamatics:refresh'

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
