/**
 * Last-good layout cache.
 *
 * A signage screen has to keep playing through network drops and survive a
 * reboot with no connectivity, so every successful fetch is written to
 * localStorage and used as the boot payload next time.
 */

const PREFIX = 'ps_display_cache:'
const VERSION = 1

function key(publicKey) {
  return `${PREFIX}${publicKey}`
}

export function readCache(publicKey) {
  if (!publicKey) return null
  try {
    const raw = localStorage.getItem(key(publicKey))
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (parsed?.version !== VERSION || !parsed?.display) return null

    return { display: parsed.display, cachedAt: parsed.cachedAt }
  } catch {
    return null
  }
}

export function writeCache(publicKey, display) {
  if (!publicKey || !display) return
  try {
    localStorage.setItem(
      key(publicKey),
      JSON.stringify({ version: VERSION, cachedAt: new Date().toISOString(), display })
    )
  } catch {
    // Storage full or blocked (private mode) — playback still works from memory.
  }
}

export function clearCache(publicKey) {
  try {
    localStorage.removeItem(key(publicKey))
  } catch {
    // ignore
  }
}

/** Remember which screen this device is paired to so it reboots into the right display. */
const PAIR_KEY = 'ps_display_paired_key'

export function readPairedKey() {
  try {
    return localStorage.getItem(PAIR_KEY) || ''
  } catch {
    return ''
  }
}

export function writePairedKey(publicKey) {
  try {
    if (publicKey) localStorage.setItem(PAIR_KEY, publicKey)
    else localStorage.removeItem(PAIR_KEY)
  } catch {
    // ignore
  }
}
