import Display from '../models/Display.js'
import User from '../models/User.js'
import { fetchSharedGoogleCalendars } from './googleOAuth.js'

const REFRESH_MS = 60 * 1000
const lastRefresh = new Map()

function hasCalendar(pages) {
  return (pages || []).some((page) => (page.widgets || []).some((widget) => widget.type === 'calendar'))
}

/** Pull the connected Google account, including calendars other people shared, and store the meetings. */
export async function refreshDisplayCalendars(display) {
  if (!display?._id || !hasCalendar(display.pages)) return null

  const key = String(display._id)
  const now = Date.now()
  if (now - (lastRefresh.get(key) || 0) < REFRESH_MS) return null

  const owner = await User.findById(display.createdBy).select('name googleEmail googleRefreshToken')
  if (!owner?.googleRefreshToken) return null

  lastRefresh.set(key, now)

  try {
    const dayChoices = [
      ...new Set(
        (display.pages || [])
          .flatMap((page) => page.widgets || [])
          .filter((widget) => widget.type === 'calendar')
          .map((widget) => Math.max(1, Math.min(Number(widget.props?.days) || 1, 14)))
      ),
    ]
    const byDays = new Map()
    await Promise.all(
      dayChoices.map(async (days) => {
        const result = await fetchSharedGoogleCalendars(owner.googleRefreshToken, {
          days,
          email: owner.googleEmail,
          accountName: owner.name,
        })
        byDays.set(days, result)
      })
    )

    const pages = (display.pages || []).map((page) => ({
      ...page,
      widgets: (page.widgets || []).map((widget) => {
        if (widget.type !== 'calendar') return widget
        const days = Math.max(1, Math.min(Number(widget.props?.days) || 1, 14))
        const result = byDays.get(days)
        if (!result) return widget
        return {
          ...widget,
          props: {
            ...(widget.props || {}),
            items: result.items || [],
            legend: result.legend || [],
            syncedAt: result.syncedAt,
            source: 'google',
            mail: result.email || widget.props?.mail || '',
            title: widget.props?.title || result.title || "Today's Schedule",
          },
        }
      }),
    }))

    await Display.updateOne({ _id: display._id }, { $set: { pages } }, { timestamps: false })
    return pages
  } catch (err) {
    console.error('Calendar auto-refresh failed:', err?.message || err)
    return null
  }
}
