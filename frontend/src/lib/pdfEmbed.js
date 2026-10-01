/**
 * Turn common "share page" links into something a player can actually show.
 * Google Drive / Dropbox view pages return HTML, not a PDF file.
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

/**
 * URL to put in an <iframe> / <object> for a PDF (or Google Drive preview).
 * Returns { embedUrl, needsProxy, kind }.
 */
export function resolvePdfEmbed(rawUrl, { apiUrl, apiOrigin } = {}) {
  const api = apiUrl || ''
  const origin = apiOrigin || (api ? api.replace(/\/api\/?$/, '') : '')
  let url = String(rawUrl || '').trim()
  if (!url) return { embedUrl: '', needsProxy: false, kind: 'empty' }

  if (url.startsWith('/uploads/')) {
    const absolute = `${origin}${url}`
    return { embedUrl: withPdfHash(absolute), needsProxy: false, kind: 'upload' }
  }

  if (url.startsWith(origin) && url.includes('/uploads/')) {
    return { embedUrl: withPdfHash(url.split('#')[0]), needsProxy: false, kind: 'upload' }
  }

  // Already a proxy URL — leave it alone (minus any hash we will re-add).
  if (url.includes('/api/media/proxy')) {
    return { embedUrl: withPdfHash(url.split('#')[0]), needsProxy: false, kind: 'proxy' }
  }

  if (!/^https?:\/\//i.test(url)) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  }

  // Google Drive share / view links embed best via Google's own preview player.
  const driveId = extractGoogleDriveId(url)
  if (driveId && /drive\.google\.com|docs\.google\.com/i.test(url)) {
    return {
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      needsProxy: false,
      kind: 'gdrive',
    }
  }

  // Dropbox share → direct file
  if (/dropbox\.com/i.test(url)) {
    url = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?dl=1')
      .replace('&dl=0', '&dl=1')
    if (!/[?&]dl=1/.test(url) && !url.includes('dl.dropboxusercontent.com')) {
      url += (url.includes('?') ? '&' : '?') + 'dl=1'
    }
  }

  // Our own API / uploads already absolute
  if (origin && url.startsWith(origin)) {
    return { embedUrl: withPdfHash(url.split('#')[0]), needsProxy: false, kind: 'local' }
  }

  // Remote direct file — go through the public media proxy so hotlink/CORS
  // and missing auth on iframes do not blank the viewer.
  if (api) {
    const proxied = `${api}/media/proxy?url=${encodeURIComponent(url.split('#')[0])}`
    return { embedUrl: withPdfHash(proxied), needsProxy: true, kind: 'remote' }
  }

  return { embedUrl: withPdfHash(url.split('#')[0]), needsProxy: false, kind: 'remote' }
}

function withPdfHash(url) {
  if (!url) return ''
  if (url.includes('drive.google.com')) return url
  return url.includes('#') ? url : `${url}#toolbar=0&navpanes=0&view=FitH`
}

/** Same idea for images/videos — Dropbox share → direct. */
export function normalizeRemoteFileUrl(rawUrl) {
  let url = String(rawUrl || '').trim()
  if (!url) return ''

  const driveId = extractGoogleDriveId(url)
  if (driveId && /drive\.google\.com|docs\.google\.com/i.test(url)) {
    // Direct download for <img>/<video>; preview is for PDF iframes only.
    return `https://drive.google.com/uc?export=download&id=${driveId}`
  }

  if (/dropbox\.com/i.test(url)) {
    url = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?dl=1')
      .replace('&dl=0', '&dl=1')
  }

  return url.split('#')[0]
}
