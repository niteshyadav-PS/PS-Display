import { Router } from 'express'
import { asyncHandler, HttpError } from '../middleware/errorHandler.js'
import { proxyLimiter } from '../middleware/rateLimit.js'
import { fetchPublicUrl } from '../lib/safeFetch.js'

const router = Router()

/** Max HTML we will rewrite — embeds are pages, not downloads. */
const MAX_HTML_BYTES = 5 * 1024 * 1024

function errorPage(title, detail) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;background:#111;color:#fff">
<h3 style="margin:0 0 8px">${title}</h3>
<p style="color:#aaa;margin:0">${detail}</p>
</body></html>`
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

function rewriteHtml(html, pageUrl) {
  const baseHref = `${new URL(pageUrl).origin}/`
  let out = String(html)

  // Remove framing / CSP meta tags that block embedding
  out = out.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
  out = out.replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '')

  if (/<base\s/i.test(out)) {
    out = out.replace(/<base[^>]*>/i, `<base href="${baseHref}">`)
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`)
  } else {
    out = `<!doctype html><html><head><base href="${baseHref}"></head><body>${out}</body></html>`
  }

  return out
}

router.get(
  '/embed',
  proxyLimiter,
  asyncHandler(async (req, res) => {
    let result
    try {
      result = await fetchPublicUrl(req.query.url, {
        maxBytes: MAX_HTML_BYTES,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
    } catch (err) {
      // Embeds render inside an iframe, so reply with a readable page instead of JSON.
      return res
        .status(err.status || 502)
        .type('html')
        .send(errorPage('Could not load website', escapeHtml(err.message || 'Unknown error')))
    }

    const { upstream, readBody } = result
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8'
    const finalUrl = upstream.url || String(req.query.url)

    // Do not forward framing headers
    res.removeHeader('X-Frame-Options')
    res.setHeader('Content-Security-Policy', 'frame-ancestors *')
    res.setHeader('Cache-Control', 'no-store')

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .type('html')
        .send(errorPage('Could not load website', `Status ${upstream.status} for ${escapeHtml(finalUrl)}`))
    }

    const body = await readBody()

    if (contentType.includes('text/html')) {
      return res.type('html').send(rewriteHtml(body.toString('utf8'), finalUrl))
    }

    if (!/^(text|image|video|application)\//.test(contentType)) {
      throw new HttpError(415, 'Unsupported content type for embedding')
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(body)
  })
)

export default router
