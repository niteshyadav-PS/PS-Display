import { Router } from 'express'
import mongoose from 'mongoose'
import config from '../config/env.js'
import Display from '../models/Display.js'
import User from '../models/User.js'
import Media from '../models/Media.js'
import SupportRequest from '../models/SupportRequest.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { isScheduleActive } from '../lib/schedule.js'

const router = Router()

const WIDGET_LABELS = {
  clock: 'Clock',
  weather: 'Weather',
  calendar: 'Calendar',
  image: 'Image',
  video: 'Video',
  heading: 'Heading',
  text: 'Text',
  pdf: 'PDF',
  web: 'Web',
  dashboard: 'KPIs',
  quotes: 'Quotes',
  news: 'News',
  notes: 'Notes',
}

const PALETTE = ['#8bc53f', '#f59e0b', '#8b5cf6', '#eab308', '#38bdf8', '#f472b6', '#34d399']

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Displays created/updated per day for the last `days` days, zero-filled. */
function buildActivity(displays, days = 7) {
  const buckets = new Map()
  const today = startOfDay(new Date())

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    buckets.set(day.getTime(), {
      date: day.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      created: 0,
      updated: 0,
    })
  }

  const earliest = today.getTime() - (days - 1) * 86400000

  for (const display of displays) {
    const createdKey = startOfDay(display.createdAt).getTime()
    if (createdKey >= earliest && buckets.has(createdKey)) {
      buckets.get(createdKey).created += 1
    }

    const updatedKey = startOfDay(display.updatedAt).getTime()
    // Only count an update if it happened on a later day than creation.
    if (updatedKey >= earliest && updatedKey !== createdKey && buckets.has(updatedKey)) {
      buckets.get(updatedKey).updated += 1
    }
  }

  return [...buckets.values()]
}

/** Real share of displays per location, largest first with an "Other" rollup. */
function buildUsage(displays) {
  if (!displays.length) return []

  const counts = new Map()
  for (const display of displays) {
    const key = (display.location || 'Unassigned').trim() || 'Unassigned'
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 5)
  const restTotal = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0)
  if (restTotal) top.push(['Other', restTotal])

  return top.map(([name, count], i) => ({
    name,
    value: Math.round((count / displays.length) * 100),
    count,
    color: PALETTE[i % PALETTE.length],
  }))
}

/** Which widget types this user actually relies on. */
function buildWidgetUsage(displays) {
  const counts = new Map()

  for (const display of displays) {
    for (const page of display.pages || []) {
      for (const widget of page.widgets || []) {
        counts.set(widget.type, (counts.get(widget.type) || 0) + 1)
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, uses]) => ({ name: WIDGET_LABELS[type] || type, uses }))
}

router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'Administrator'
    if (isAdmin) {
      const people = await User.find().select('_id').lean()
      await Display.deleteMany({ createdBy: { $nin: people.map((person) => person._id) } })
    }

    const [displays, teamMembers, mediaCount, mediaBytes, openRequests] = await Promise.all([
        Display.find(isAdmin ? {} : { createdBy: req.user._id })
          .select(
            'name status location department pages published schedule createdAt updatedAt lastSeenAt deviceType createdBy'
          )
          .populate('createdBy', 'name username department')
          .sort({ updatedAt: -1 })
          .lean(),
        User.countDocuments(),
        Media.countDocuments({ uploadedBy: req.user._id }),
        Media.aggregate([
          { $match: { uploadedBy: new mongoose.Types.ObjectId(req.user._id) } },
          { $group: { _id: null, total: { $sum: '$size' } } },
        ]),
        isAdmin ? SupportRequest.countDocuments({ status: 'Open' }) : 0,
      ])

    const now = Date.now()
    const onlineCount = displays.filter(
      (d) => d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < config.displayOfflineAfterMs
    ).length

    const publishedCount = displays.filter((d) => d.published).length
    const totalPages = displays.reduce((sum, d) => sum + (d.pages?.length || 0), 0)
    const totalWidgets = displays.reduce(
      (sum, d) => sum + (d.pages || []).reduce((n, p) => n + (p.widgets?.length || 0), 0),
      0
    )
    const scheduledCount = displays.filter((d) => d.schedule?.enabled).length

    const team = await User.find().select('name role avatar').limit(6).lean()

    res.json({
      kpis: {
        teamMembers,
        totalDisplays: displays.length,
        published: publishedCount,
        online: onlineCount,
        offline: Math.max(0, publishedCount - onlineCount),
        pages: totalPages,
        widgets: totalWidgets,
        scheduled: scheduledCount,
        openRequests,
      },
      activity: buildActivity(displays),
      usage: buildUsage(displays),
      topWidgets: buildWidgetUsage(displays),
      recentDisplays: displays.slice(0, 5).map((d) => ({
        ...d,
        owner:
          d.createdBy && typeof d.createdBy === 'object'
            ? {
                id: d.createdBy._id,
                name: d.createdBy.name,
                username: d.createdBy.username || '',
                department: d.createdBy.department || '',
              }
            : null,
        createdBy: d.createdBy && typeof d.createdBy === 'object' ? d.createdBy._id : d.createdBy,
        online:
          Boolean(d.lastSeenAt) &&
          now - new Date(d.lastSeenAt).getTime() < config.displayOfflineAfterMs,
        scheduleActive: isScheduleActive(d.schedule),
      })),
      team: team.map((u) => ({
        id: u._id,
        name: u.name,
        role: u.role,
        avatar: u.avatar || '',
        displays: displays
          .filter((d) => String(d.createdBy?._id || d.createdBy) === String(u._id))
          .map((d) => ({ id: d._id, name: d.name })),
      })),
      media: {
        count: mediaCount,
        bytes: mediaBytes[0]?.total || 0,
      },
      // Kept for backwards compatibility with the existing dashboard cards.
      mediaCount,
    })
  })
)

export default router
