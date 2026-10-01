/** Player-side PDF / share-link helpers (mirrors frontend/src/lib/pdfEmbed.js). */

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

function withPdfHash(url) {
  if (!url) return ''
  if (url.includes('drive.google.com')) return url
  return url.includes('#') ? url : `${url}#toolbar=0&navpanes=0&view=FitH`
}

export function resolvePdfEmbed(rawUrl, { apiUrl, apiOrigin } = {}) {
  const api = apiUrl || ''
  const origin = apiOrigin || (api ? api.replace(/\/api\/?$/, '') : '')
  let url = String(rawUrl || '').trim()
  if (!url) return { embedUrl: '', kind: 'empty' }

  if (url.startsWith('/uploads/')) {
    return { embedUrl: withPdfHash(`${origin}${url}`), kind: 'upload' }
  }

  if (url.startsWith(origin) && url.includes('/uploads/')) {
    return { embedUrl: withPdfHash(url.split('#')[0]), kind: 'upload' }
  }

  if (url.includes('/api/media/proxy')) {
    return { embedUrl: withPdfHash(url.split('#')[0]), kind: 'proxy' }
  }

  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  const driveId = extractGoogleDriveId(url)
  if (driveId && /drive\.google\.com|docs\.google\.com/i.test(url)) {
    return {
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      kind: 'gdrive',
    }
  }

  if (/dropbox\.com/i.test(url)) {
    url = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?dl=1')
      .replace('&dl=0', '&dl=1')
  }

  if (origin && url.startsWith(origin)) {
    return { embedUrl: withPdfHash(url.split('#')[0]), kind: 'local' }
  }

  if (api) {
    const proxied = `${api}/media/proxy?url=${encodeURIComponent(url.split('#')[0])}`
    return { embedUrl: withPdfHash(proxied), kind: 'remote' }
  }

  return { embedUrl: withPdfHash(url.split('#')[0]), kind: 'remote' }
}
