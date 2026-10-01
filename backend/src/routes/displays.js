import { Router } from 'express'
import { nanoid } from 'nanoid'
import config from '../config/env.js'
import Display, { generateDeviceCode } from '../models/Display.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../middleware/errorHandler.js'
import { playerLimiter } from '../middleware/rateLimit.js'
import { validate } from '../middleware/validate.js'
import {
  createDisplaySchema,
  pairDeviceSchema,
  updateDisplaySchema,
} from '../validation/schemas.js'
import { describeSchedule, isScheduleActive } from '../lib/schedule.js'
import { refreshDisplayCalendars } from '../services/calendarRefresh.js'

const router = Router()

/** Widget presets per layout, rebuilt per call so every display gets fresh widget ids. */
function widgetsForLayout(layout) {
  const presets = {
    blank: [],
    '1-column': [
      { type: 'text', x: 80, y: 80, w: 1120, h: 560, props: { title: 'Welcome', body: 'Add your content here' } },
    ],
    '2-columns': [
      { type: 'clock', x: 60, y: 60, w: 240, h: 140, props: { scale: 1 } },
      { type: 'weather', x: 660, y: 60, w: 560, h: 280, props: { condition: 'Partly Cloudy' } },
    ],
    '3-columns': [
      { type: 'clock', x: 40, y: 80, w: 240, h: 140, props: { scale: 1 } },
      { type: 'news', x: 450, y: 80, w: 380, h: 520, props: { title: 'Headlines' } },
      { type: 'calendar', x: 860, y: 80, w: 380, h: 520, props: { title: "Today's Schedule" } },
    ],
    'header-content': [
      { type: 'text', x: 40, y: 30, w: 1200, h: 90, props: { title: 'Company Announcement', body: '' } },
      { type: 'dashboard', x: 40, y: 150, w: 1200, h: 500, props: { title: 'Company KPIs' } },
    ],
    'sidebar-content': [
      { type: 'notes', x: 40, y: 40, w: 280, h: 640, props: { title: 'Notes' } },
      { type: 'text', x: 350, y: 40, w: 890, h: 640, props: { title: 'Main Content', body: '' } },
    ],
  }

  return (presets[layout] || []).map((widget) => ({ ...widget, id: nanoid(8) }))
}

function isOnline(display) {
  if (!display?.lastSeenAt) return false
  return Date.now() - new Date(display.lastSeenAt).getTime() < config.displayOfflineAfterMs
}

function ownerFilter(req) {
  if (req.user?.role === 'Administrator') return {}
  return { createdBy: req.user._id }
}

async function removeOrphanDisplays() {
  const people = await User.find().select('_id').lean()
  await Display.deleteMany({ createdBy: { $nin: people.map((person) => person._id) } })
}

function present(display) {
  const json = typeof display.toObject === 'function' ? display.toObject() : { ...display }
  const ownerDoc = json.createdBy && typeof json.createdBy === 'object' ? json.createdBy : null
  return {
    ...json,
    createdBy: ownerDoc?._id || json.createdBy || null,
    owner: ownerDoc
      ? {
          id: ownerDoc._id,
          name: ownerDoc.name,
          username: ownerDoc.username || '',
          department: ownerDoc.department || '',
        }
      : null,
    online: isOnline(display),
    paired: Boolean(display.pairedAt),
    scheduleLabel: describeSchedule(display.schedule),
    scheduleActive: isScheduleActive(display.schedule),
    playerUrl: `${config.playerUrl}/d/${display.publicKey}`,
  }
}

/** Collapse absolute upload URLs to portable `/uploads/...` paths for the player. */
function portableMediaUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return raw
  if (raw.startsWith('/uploads/')) return raw.split(/[?#]/)[0]
  try {
    const parsed = new URL(raw)
    if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname
  } catch {
    // ignore
  }
  return raw
}

function normalizePagesForPlayer(pages = []) {
  return pages.map((page) => ({
    ...page,
    backgroundImage: page.backgroundImage ? portableMediaUrl(page.backgroundImage) : '',
    widgets: (page.widgets || []).map((widget) => {
      const props = { ...(widget.props || {}) }
      if (props.src) props.src = portableMediaUrl(props.src)
      if (props.url) props.url = portableMediaUrl(props.url)
      return { ...widget, props }
    }),
  }))
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { search = '', status = '', online = '' } = req.query
    const isAdmin = req.user.role === 'Administrator'
    if (isAdmin) await removeOrphanDisplays()
    const query = { ...ownerFilter(req) }

    if (String(search).trim()) {
      // Escape regex metacharacters so a search for "a.b" is not treated as a pattern.
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rx = new RegExp(safe, 'i')
      query.$or = [{ name: rx }, { location: rx }, { deviceCode: rx }]
      if (isAdmin) {
        const people = await User.find({
          $or: [{ name: rx }, { username: rx }],
        })
          .select('_id')
          .lean()
        if (people.length) query.$or.push({ createdBy: { $in: people.map((person) => person._id) } })
      }
    }
    if (['Active', 'Inactive', 'Pending'].includes(String(status))) {
      query.status = status
    }

    const displays = await Display.find(query)
      .populate('createdBy', 'name username department')
      .sort({ updatedAt: -1 })
      .limit(200)
    let result = displays.map(present).filter((display) => display.owner)

    if (online === 'true') result = result.filter((d) => d.online)
    if (online === 'false') result = result.filter((d) => !d.online)

    res.json({ displays: result })
  })
)

/** Public player endpoint — no auth (must be declared before /:id) */
router.get(
  '/public/:publicKey',
  playerLimiter,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({
      publicKey: req.params.publicKey,
      published: true,
    }).lean()

    if (!display) throw new HttpError(404, 'Display not found or not published')

    const refreshedPages = await refreshDisplayCalendars(display)
    const pages = refreshedPages || display.pages

    // Heartbeat must not bump updatedAt — the player uses that as a content
    // revision, and resetting to page 1 every poll skips later pages.
    Display.updateOne(
      { _id: display._id },
      {
        $set: {
          lastSeenAt: new Date(),
          lastSeenUserAgent: String(req.get('user-agent') || '').slice(0, 200),
        },
        $inc: { heartbeatCount: 1 },
      },
      { timestamps: false }
    ).catch((err) => console.error('heartbeat failed', err))

    res.set('Cache-Control', 'no-store')
    res.json({
      display: {
        id: display._id,
        name: display.name,
        orientation: display.orientation,
        pages: normalizePagesForPlayer(pages),
        schedule: display.schedule || null,
        playbackStopped: Boolean(display.playbackStopped),
        updatedAt: display.updatedAt,
      },
      // Let the player back off on its own instead of hardcoding the interval.
      pollAfterMs: 15000,
      serverTime: new Date().toISOString(),
    })
  })
)

/**
 * Screens that are not paired yet announce themselves with a code the operator
 * can type into the portal. Unauthenticated by design, rate limited, and it only
 * ever reveals whether that code has been claimed.
 */
router.get(
  '/pair/:deviceCode',
  playerLimiter,
  asyncHandler(async (req, res) => {
    const code = String(req.params.deviceCode || '').trim().toUpperCase()
    const display = await Display.findOne({ deviceCode: code }).lean()

    if (!display || !display.published) {
      return res.json({ paired: false })
    }

    res.set('Cache-Control', 'no-store')
    res.json({
      paired: true,
      publicKey: display.publicKey,
      name: display.name,
    })
  })
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')
    res.json({ display: present(display) })
  })
)

router.post(
  '/',
  requireAuth,
  validate(createDisplaySchema),
  asyncHandler(async (req, res) => {
    const { name, deviceType, layout, orientation, location } = req.body

    const display = await Display.create({
      name,
      deviceType,
      layout,
      orientation,
      location,
      department:
        req.user.role === 'Administrator' ? 'Admin' : req.user.department || '',
      status: 'Active',
      createdBy: req.user._id,
      pages: [
        {
          id: nanoid(8),
          name: 'Page 1',
          durationSec: 10,
          backgroundColor: '#ffffff',
          widgets: widgetsForLayout(layout),
        },
      ],
    })

    res.status(201).json({ display: present(display) })
  })
)

router.put(
  '/:id',
  requireAuth,
  validate(updateDisplaySchema),
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    // req.body is already whitelisted and coerced by the schema.
    Object.assign(display, req.body)
    await display.save()

    res.json({ display: present(display) })
  })
)

router.post(
  '/:id/publish',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    display.published = true
    display.status = 'Active'
    await display.save()

    res.json({ display: present(display), playerUrl: `${config.playerUrl}/d/${display.publicKey}` })
  })
)

/** Blank the live screen remotely (player stays online / paired). */
router.post(
  '/:id/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    display.playbackStopped = true
    display.status = 'Inactive'
    await display.save()

    res.json({ display: present(display) })
  })
)

/** Resume playback on a remotely stopped screen. */
router.post(
  '/:id/resume',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    display.playbackStopped = false
    if (display.published) display.status = 'Active'
    await display.save()

    res.json({ display: present(display) })
  })
)

/** Claim a screen that is showing a pairing code. */
router.post(
  '/:id/pair',
  requireAuth,
  validate(pairDeviceSchema),
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    if (display.deviceCode !== req.body.code) {
      throw new HttpError(400, 'That code does not match this display')
    }

    display.pairedAt = new Date()
    display.published = true
    display.status = 'Active'
    await display.save()

    res.json({ display: present(display) })
  })
)

/** Issue a fresh pairing code, invalidating the old one. */
router.post(
  '/:id/reset-code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).populate(
      'createdBy',
      'name username department'
    )
    if (!display) throw new HttpError(404, 'Display not found')

    display.deviceCode = generateDeviceCode()
    display.pairedAt = null
    await display.save()

    res.json({ display: present(display) })
  })
)

router.post(
  '/:id/duplicate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const source = await Display.findOne({ _id: req.params.id, ...ownerFilter(req) }).lean()
    if (!source) throw new HttpError(404, 'Display not found')

    const copy = await Display.create({
      name: `${source.name} (copy)`,
      deviceType: source.deviceType,
      layout: source.layout,
      orientation: source.orientation,
      location: source.location,
      department: source.department || '',
      status: 'Pending',
      schedule: source.schedule,
      createdBy: req.user._id,
      published: false,
      // New ids so the copy's pages are independent of the original.
      pages: (source.pages || []).map((page) => ({
        ...page,
        id: nanoid(8),
        widgets: (page.widgets || []).map((widget) => ({ ...widget, id: nanoid(8) })),
      })),
    })

    res.status(201).json({ display: present(copy) })
  })
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const display = await Display.findOneAndDelete({
      _id: req.params.id,
      ...ownerFilter(req),
    })
    if (!display) throw new HttpError(404, 'Display not found')
    res.json({ message: 'Display deleted' })
  })
)

export default router
