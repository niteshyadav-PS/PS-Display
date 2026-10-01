import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { nanoid } from 'nanoid'
import config from '../config/env.js'
import Media from '../models/Media.js'
import Display from '../models/Display.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../middleware/errorHandler.js'
import { proxyLimiter, uploadLimiter } from '../middleware/rateLimit.js'
import { validate } from '../middleware/validate.js'
import { createMediaSchema } from '../validation/schemas.js'
import { fetchPublicUrl } from '../lib/safeFetch.js'
import { looksLikePdf, normalizeRemoteFileUrl } from '../lib/remoteMedia.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const uploadsDir = path.join(__dirname, '../../uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

/** Only extensions we are willing to serve back, keyed by accepted mime type. */
const ALLOWED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['image/svg+xml', '.svg'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/ogg', '.ogv'],
  ['video/quicktime', '.mov'],
  ['application/pdf', '.pdf'],
])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    // Never trust the client filename — derive the extension from the mime type.
    const ext = ALLOWED_TYPES.get(file.mimetype) || '.bin'
    cb(null, `${nanoid(16)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true)
    cb(new HttpError(415, 'Only images, videos (mp4/webm/ogv/mov), or PDF files are allowed'))
  },
})

function detectMediaType(mimetype) {
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype === 'application/pdf') return 'pdf'
  if (mimetype.startsWith('image/')) return 'image'
  return 'other'
}

function publicBase(req) {
  if (config.publicApiUrl) return config.publicApiUrl
  return `${req.protocol}://${req.get('host')}`
}

function absoluteUrl(req, url) {
  return url?.startsWith('/uploads/') ? `${publicBase(req)}${url}` : url
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search = '', type = '' } = req.query
    const query = { uploadedBy: req.user._id }

    if (String(search).trim()) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.name = new RegExp(safe, 'i')
    }
    if (['image', 'video', 'pdf', 'other'].includes(String(type))) {
      query.type = type
    }

    const items = await Media.find(query).sort({ createdAt: -1 }).limit(500).lean()

    res.json({
      media: items.map((item) => ({ ...item, url: absoluteUrl(req, item.url) })),
    })
  })
)

/**
 * Which displays reference a media asset, so the UI can warn before deleting
 * something that is live on a screen.
 */
async function findUsage(userId, item, absolute) {
  const candidates = [item.url, absolute].filter(Boolean)
  const displays = await Display.find({ createdBy: userId })
    .select('name pages.widgets.props')
    .lean()

  return displays
    .filter((display) =>
      (display.pages || []).some((page) =>
        (page.widgets || []).some((widget) => {
          const src = widget?.props?.src || widget?.props?.url || ''
          return candidates.some((candidate) => src && src.includes(candidate))
        })
      )
    )
    .map((display) => ({ id: display._id, name: display.name }))
}

router.get(
  '/:id/usage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id }).lean()
    if (!item) throw new HttpError(404, 'Media not found')

    const usedBy = await findUsage(req.user._id, item, absoluteUrl(req, item.url))
    res.json({ usedBy })
  })
)

router.post(
  '/',
  requireAuth,
  validate(createMediaSchema),
  asyncHandler(async (req, res) => {
    const item = await Media.create({ ...req.body, uploadedBy: req.user._id })
    res.status(201).json({ media: item })
  })
)

router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'File is required')

    const relativeUrl = `/uploads/${req.file.filename}`
    const name =
      String(req.body.name || '').trim() ||
      path.parse(req.file.originalname || 'media').name ||
      'Uploaded media'

    const item = await Media.create({
      name: name.slice(0, 200),
      type: detectMediaType(req.file.mimetype),
      url: relativeUrl,
      size: req.file.size || 0,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    })

    res.status(201).json({ media: { ...item.toObject(), url: absoluteUrl(req, relativeUrl) } })
  })
)

/**
 * Proxy remote media so hotlink/CORS blocks do not break the editor or player.
 *
 * Intentionally public (rate-limited + SSRF-guarded): <iframe> / <img> / <video>
 * cannot send Authorization headers, so requiring JWT made every pasted remote
 * PDF render as a blank frame.
 */
router.get(
  '/proxy',
  proxyLimiter,
  asyncHandler(async (req, res) => {
    const requested = String(req.query.url || '').trim()
    if (!requested) throw new HttpError(400, 'A URL is required')

    const target = normalizeRemoteFileUrl(requested)
    const { upstream, readBody } = await fetchPublicUrl(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/pdf,image/*,video/*,application/octet-stream,*/*',
      },
    })

    if (!upstream.ok) {
      throw new HttpError(upstream.status === 404 ? 404 : 502, 'Failed to fetch remote media')
    }

    const body = await readBody()
    let contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()

    // Many CDNs serve PDFs as octet-stream; sniff the magic bytes.
    const pathLooksPdf = /\.pdf(\?|$)/i.test(target) || /\.pdf(\?|$)/i.test(requested)
    if ((!contentType || contentType === 'application/octet-stream') && looksLikePdf(body)) {
      contentType = 'application/pdf'
    } else if (pathLooksPdf && looksLikePdf(body)) {
      contentType = 'application/pdf'
    }

    const allowed =
      contentType.startsWith('image/') ||
      contentType.startsWith('video/') ||
      contentType === 'application/pdf'

    if (!allowed) {
      // Google Drive often returns an HTML interstitial for large files.
      throw new HttpError(
        415,
        'URL did not return an image, video, or PDF. Use a direct .pdf link, upload the file, or paste a Google Drive file link.'
      )
    }

    res.setHeader('Content-Type', contentType)
    // Force inline so browsers render PDFs in iframes instead of downloading.
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Allow the admin and player origins to embed the proxied file.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.removeHeader('X-Frame-Options')
    res.send(body)
  })
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id })
    if (!item) throw new HttpError(404, 'Media not found')

    // Refuse by default when the asset is live on a display; ?force=true overrides.
    if (req.query.force !== 'true') {
      const usedBy = await findUsage(req.user._id, item, absoluteUrl(req, item.url))
      if (usedBy.length) {
        return res.status(409).json({
          message: `This file is used by ${usedBy.length} display(s). Delete anyway?`,
          usedBy,
        })
      }
    }

    await item.deleteOne()

    if (item.url?.startsWith('/uploads/')) {
      const filePath = path.join(uploadsDir, path.basename(item.url))
      // Stay inside the uploads directory even if the stored name is odd.
      if (filePath.startsWith(uploadsDir)) {
        fs.promises.unlink(filePath).catch(() => {})
      }
    }

    res.json({ message: 'Deleted' })
  })
)

export default router
