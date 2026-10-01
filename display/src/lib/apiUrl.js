/**
 * Resolve the API base URL for this player instance.
 * When the page is opened via a LAN IP (TV / phone) but .env still points at
 * localhost, rewrite the host so requests hit the PC that is serving the player.
 */
export function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  if (typeof window === 'undefined') return configured

  try {
    const url = new URL(configured)
    const pageHost = window.location.hostname
    const isLocalApi = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const isLanPage = pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1'
    if (isLocalApi && isLanPage) {
      url.hostname = pageHost
      return url.toString().replace(/\/$/, '')
    }
  } catch {
    // fall through
  }

  return configured.replace(/\/$/, '')
}
