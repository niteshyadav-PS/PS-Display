import { JWT } from 'google-auth-library'

function getPrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY || ''
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

function requireGoogleConfig() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = getPrivateKey()
  if (!clientEmail || !privateKey) {
    const err = new Error(
      'Google Calendar is not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in backend/.env'
    )
    err.status = 503
    throw err
  }
  return { clientEmail, privateKey }
}

async function getAccessToken(subjectEmail) {
  const { clientEmail, privateKey } = requireGoogleConfig()
  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: subjectEmail || undefined,
  })
  const token = await client.getAccessToken()
  if (!token?.token) {
    const err = new Error('Failed to get Google access token')
    err.status = 502
    throw err
  }
  return token.token
}

function formatEventTime(start) {
  if (!start) return '--:--'
  if (start.date && !start.dateTime) return 'All day'
  const value = start.dateTime || start.date
  const match = String(value).match(/T(\d{2}):(\d{2})/)
  if (match) return `${match[1]}:${match[2]}`
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return '--:--'
  }
}

async function listEvents(accessToken, calendarId, { days = 1 } = {}) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(1, Math.min(Number(days) || 1, 14)))

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    let message = data?.error?.message || 'Failed to fetch Google Calendar'
    if (res.status === 404) {
      message =
        `Calendar not found or not shared with the service account (${process.env.GOOGLE_CLIENT_EMAIL}). ` +
        `In Google Calendar → Settings → Share with specific people → add that email → “See all event details”.`
    }
    const err = new Error(message)
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    err.code = data?.error?.status
    throw err
  }
  return Array.isArray(data.items) ? data.items : []
}

/**
 * Fetch Google Calendar events for a mailbox/calendar email.
 * Supports:
 * 1) Google Workspace domain-wide delegation (impersonate the user)
 * 2) Calendar shared with the service account (calendarId = email)
 */
export async function fetchGoogleCalendarByEmail(email, { days = 1 } = {}) {
  const mailbox = String(email || '').trim().toLowerCase()
  if (!mailbox || !mailbox.includes('@')) {
    const err = new Error('A valid Google account email is required')
    err.status = 400
    throw err
  }

  let events
  let mode = 'shared'

  // Prefer Workspace impersonation when enabled (default true if not set)
  const allowImpersonate = process.env.GOOGLE_IMPERSONATE !== 'false'
  if (allowImpersonate) {
    try {
      const token = await getAccessToken(mailbox)
      events = await listEvents(token, 'primary', { days })
      mode = 'impersonate'
    } catch (err) {
      // Fall back to shared-calendar access with the service account itself
      const token = await getAccessToken(undefined)
      try {
        events = await listEvents(token, mailbox, { days })
        mode = 'shared'
      } catch (sharedErr) {
        const err2 = new Error(
          `${sharedErr.message}. Tip: For Google Workspace enable domain-wide delegation, or share the calendar with ${process.env.GOOGLE_CLIENT_EMAIL}`
        )
        err2.status = sharedErr.status || err.status || 502
        throw err2
      }
    }
  } else {
    const token = await getAccessToken(undefined)
    events = await listEvents(token, mailbox, { days })
  }

  const items = events.map((ev) => {
    const location = ev.location ? ` · ${ev.location}` : ''
    return {
      time: formatEventTime(ev.start),
      label: `${ev.summary || 'Meeting'}${location}`,
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      subject: ev.summary || 'Meeting',
    }
  })

  return {
    email: mailbox,
    title: days > 1 ? `Schedule · next ${days} days` : "Today's Schedule",
    items,
    syncedAt: new Date().toISOString(),
    count: items.length,
    source: 'google',
    mode,
  }
}
