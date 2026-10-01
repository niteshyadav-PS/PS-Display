/**
 * Shared remote-URL normalisation for the media proxy.
 * Keep in sync with frontend/src/lib/pdfEmbed.js where practical.
 */

export function extractGoogleDriveId(url) {
  const value = String(url || '')
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)\//,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

/** Rewrite share-page links into fetchable file URLs before SSRF-safe fetch. */
export function normalizeRemoteFileUrl(rawUrl) {
  let url = String(rawUrl || '').trim()
  if (!url) return ''

  const driveId = extractGoogleDriveId(url)
  if (driveId && /drive\.google\.com|docs\.google\.com/i.test(url)) {
    return `https://drive.google.com/uc?export=download&id=${driveId}`
  }

  if (/dropbox\.com/i.test(url)) {
    url = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?dl=1')
      .replace('&dl=0', '&dl=1')
  }

  return url
}

/** True if the first bytes look like a PDF (%PDF). */
export function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 4) return false
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
}
