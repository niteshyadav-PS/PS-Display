import { OAuth2Client } from 'google-auth-library'

export function isGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export function isGoogleServiceAccountConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

function getRedirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 5000}/api/calendar/google/callback`
  )
}

export function createOAuthClient() {
  if (!isGoogleOAuthConfigured()) {
    const err = new Error(
      'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in backend/.env'
    )
    err.status = 503
    throw err
  }
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    getRedirectUri()
  )
}

export function getGoogleAuthUrl(state) {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  })
}

export async function exchangeGoogleCode(code) {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token && !tokens.access_token) {
    const err = new Error('Google did not return tokens. Try connecting again.')
    err.status = 502
    throw err
  }
  client.setCredentials(tokens)

  let email
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const info = await res.json().catch(() => ({}))
    email = info.email || ''
  } catch {
    email = ''
  }

  return {
    refreshToken: tokens.refresh_token || '',
    accessToken: tokens.access_token || '',
    expiryDate: tokens.expiry_date || null,
    email,
  }
}

async function getAccessTokenFromRefresh(refreshToken) {
  const client = createOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  try {
    const { token } = await client.getAccessToken()
    if (!token) {
      const err = new Error('Failed to refresh Google access token. Reconnect Google Calendar.')
      err.status = 401
      throw err
    }
    return token
  } catch (err) {
    if (err.status) throw err
    const detail = String(
      err?.message || err?.response?.data?.error || err?.response?.data?.error_description || ''
    )
    const expired = /invalid_grant|expired|revoked/i.test(detail)
    const wrapped = new Error(
      expired
        ? 'Google connection expired. Disconnect and Connect Google Account again in Settings.'
        : detail || 'Failed to refresh Google access token. Reconnect Google Calendar.'
    )
    wrapped.status = expired ? 401 : 502
    throw wrapped
  }
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  let res
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
  } catch (err) {
    const wrapped = new Error(
      err.name === 'AbortError'
        ? 'Google Calendar took too long to respond. Try again.'
        : 'Could not reach Google Calendar. Check this PC’s internet connection.'
    )
    wrapped.status = 504
    throw wrapped
  } finally {
    clearTimeout(timer)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Failed to fetch Google Calendar')
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  return Array.isArray(data.items) ? data.items : []
}

/** Fetch using the signed-in Profile Solution user's connected Google account (works with @gmail.com) */
export async function fetchGoogleCalendarForUser(user, { days = 1 } = {}) {
  if (!user?.googleRefreshToken) {
    const err = new Error('Connect your Google account first, then fetch meetings.')
    err.status = 400
    throw err
  }

  const accessToken = await getAccessTokenFromRefresh(user.googleRefreshToken)
  const calendarId = user.googleEmail || 'primary'
  const events = await listEvents(accessToken, calendarId === user.googleEmail ? 'primary' : calendarId, {
    days,
  })

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
    email: user.googleEmail || calendarId,
    title: days > 1 ? `Schedule · next ${days} days` : "Today's Schedule",
    items,
    syncedAt: new Date().toISOString(),
    count: items.length,
    source: 'google-oauth',
  }
}

const CALENDAR_COLORS = [
  '#e11d48',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#c026d3',
]

function isEmployeeCalendar(calendar) {
  if (!calendar || calendar.hidden) return false
  const haystack = `${calendar.id || ''} ${calendar.summary || ''}`
  return !/holiday|birthday|#contacts|weeknum|weather/i.test(haystack)
}

async function listCalendarList(accessToken) {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Failed to list Google calendars')
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  return (Array.isArray(data.items) ? data.items : []).filter(isEmployeeCalendar).slice(0, 25)
}

function isGenericName(value) {
  return /^(calendar|my calendar|busy|untitled|events|primary)$/i.test(String(value || '').trim())
}

function isMachineId(value) {
  const local = String(value || '').split('@')[0]
  return local.length >= 16 && /^[a-z0-9]+$/i.test(local)
}

function personFromEmail(value) {
  const address = String(value || '').trim().toLowerCase()
  if (!address.includes('@')) return ''
  if (
    address.endsWith('@group.calendar.google.com') ||
    address.endsWith('@resource.calendar.google.com') ||
    isMachineId(address)
  ) {
    return ''
  }
  const local = address.split('@')[0].replace(/[._]+/g, ' ').trim()
  if (!local || /^(calendar|noreply|no-reply)$/i.test(local)) return ''
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function eventPersonName(ev) {
  const organizer = ev?.organizer || {}
  const creator = ev?.creator || {}
  const attendee = (Array.isArray(ev?.attendees) ? ev.attendees : []).find(
    (person) => person && !person.self && !person.resource && (person.displayName || person.email)
  )
  const display = String(organizer.displayName || creator.displayName || attendee?.displayName || '').trim()
  if (display && !display.includes('@') && !isGenericName(display) && !isMachineId(display)) return display
  return (
    personFromEmail(organizer.email) ||
    personFromEmail(creator.email) ||
    personFromEmail(attendee?.email) ||
    ''
  )
}

function ownerLabel(calendar, { accountName = '', accountEmail = '' } = {}) {
  const id = String(calendar?.id || '')
  const summary = String(calendar?.summaryOverride || calendar?.summary || '').trim()
  const description = String(calendar?.description || '').trim()
  if (calendar?.primary) {
    return accountName || (!isGenericName(summary) ? summary : '') || accountEmail || 'Calendar'
  }
  if (summary && !summary.includes('@') && !isGenericName(summary)) return summary
  if (description && description.length <= 40 && !description.includes('@') && !isGenericName(description)) {
    return description
  }
  if (id.includes('@') && !isMachineId(id)) return personFromEmail(id)
  return ''
}

/** Every calendar on this Google account, including ones other people shared with it. */
export async function fetchSharedGoogleCalendars(refreshToken, { days = 1, email = '', accountName = '' } = {}) {
  if (!refreshToken) {
    const err = new Error('Connect the department Google account in Settings first.')
    err.status = 400
    throw err
  }

  const accessToken = await getAccessTokenFromRefresh(refreshToken)
  const calendars = await listCalendarList(accessToken)
  if (!calendars.length) {
    const err = new Error(
      'No calendars are shared with this Google account yet. Ask employees to share their calendars with it.'
    )
    err.status = 400
    throw err
  }

  const settled = await Promise.all(
    calendars.map(async (calendar, index) => {
      try {
        const events = await listEvents(accessToken, calendar.id, { days })
        return { ok: true, calendar, index, events }
      } catch (err) {
        return { ok: false, calendar, message: err.message || 'Failed to read calendar' }
      }
    })
  )

  const errors = settled
    .filter((row) => !row.ok)
    .map((row) => ({ email: row.calendar.summary || row.calendar.id, message: row.message }))

  const legend = []
  const items = []
  for (const row of settled) {
    if (!row.ok) continue
    const calendarName = ownerLabel(row.calendar, { accountName, accountEmail: email })
    const color = CALENDAR_COLORS[row.index % CALENDAR_COLORS.length]
    legend.push({ name: calendarName || row.calendar.summary || row.calendar.id, email: row.calendar.id, color })
    for (const ev of row.events) {
      const place = ev.location ? ` · ${ev.location}` : ''
      const person = eventPersonName(ev)
      const who = calendarName || person || 'Calendar'
      items.push({
        time: formatEventTime(ev.start),
        label: `${who} · ${ev.summary || 'Meeting'}${place}`,
        start: ev.start?.dateTime || ev.start?.date,
        end: ev.end?.dateTime || ev.end?.date,
        subject: ev.summary || 'Meeting',
        location: ev.location || '',
        calendar: who,
        calendarId: row.calendar.id,
        color,
      })
    }
  }

  items.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))

  return {
    email,
    title: days > 1 ? `Schedule · next ${days} days` : "Today's Schedule",
    items,
    legend,
    errors,
    syncedAt: new Date().toISOString(),
    count: items.length,
    source: 'google-shared',
  }
}
