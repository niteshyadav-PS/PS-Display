let cachedToken = null
let tokenExpiresAt = 0

function requireConfig() {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    const err = new Error(
      'Microsoft Calendar is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET in backend/.env'
    )
    err.status = 503
    throw err
  }
  return { tenantId, clientId, clientSecret }
}

async function getAccessToken() {
  const { tenantId, clientId, clientSecret } = requireConfig()
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Failed to get Microsoft token')
    err.status = 502
    throw err
  }

  cachedToken = data.access_token
  tokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000
  return cachedToken
}

function formatTime(dateTime) {
  const match = String(dateTime || '').match(/T(\d{2}):(\d{2})/)
  if (match) return `${match[1]}:${match[2]}`
  try {
    return new Date(dateTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '--:--'
  }
}

export async function fetchCalendarByEmail(email, { days = 1 } = {}) {
  const mailbox = String(email || '').trim().toLowerCase()
  if (!mailbox || !mailbox.includes('@')) {
    const err = new Error('A valid mailbox email is required')
    err.status = 400
    throw err
  }

  const token = await getAccessToken()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(1, Math.min(Number(days) || 1, 14)))

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: 'subject,start,end,location,isAllDay,organizer,showAs',
    $orderby: 'start/dateTime',
    $top: '50',
  })

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendarView?${params}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="Asia/Kolkata"',
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      data?.error?.message ||
      (res.status === 404
        ? `Mailbox not found: ${mailbox}`
        : res.status === 403
          ? 'App does not have permission to read this calendar. Grant Calendars.Read (Application) + admin consent.'
          : 'Failed to fetch Microsoft calendar')
    const err = new Error(message)
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }

  const events = Array.isArray(data.value) ? data.value : []
  const items = events
    .filter((ev) => ev.showAs !== 'free')
    .map((ev) => {
      const startIso = ev.start?.dateTime
      const time = ev.isAllDay ? 'All day' : formatTime(startIso)
      const location = ev.location?.displayName ? ` · ${ev.location.displayName}` : ''
      return {
        time,
        label: `${ev.subject || 'Meeting'}${location}`,
        location: ev.location?.displayName || '',
        start: startIso,
        end: ev.end?.dateTime,
        subject: ev.subject || 'Meeting',
      }
    })

  return {
    email: mailbox,
    title: days > 1 ? `Schedule · next ${days} days` : "Today's Schedule",
    items,
    syncedAt: new Date().toISOString(),
    count: items.length,
  }
}

export async function fetchCalendarsByEmails(emails, { days = 1 } = {}) {
  const list = []
  const seen = new Set()
  for (const raw of emails || []) {
    const email = String(raw || '').trim().toLowerCase()
    if (!email.includes('@') || seen.has(email)) continue
    seen.add(email)
    list.push(email)
  }
  if (!list.length) {
    const err = new Error('Add at least one mailbox email for this account')
    err.status = 400
    throw err
  }

  const results = await Promise.all(
    list.map(async (email) => {
      try {
        const result = await fetchCalendarByEmail(email, { days })
        return { ok: true, result }
      } catch (err) {
        return { ok: false, email, message: err.message || 'Failed to fetch calendar' }
      }
    })
  )

  const ok = results.filter((row) => row.ok)
  const errors = results
    .filter((row) => !row.ok)
    .map((row) => ({ email: row.email, message: row.message }))

  if (!ok.length) {
    const err = new Error(errors[0]?.message || 'Failed to fetch Microsoft calendars')
    err.status = 502
    throw err
  }

  const multi = ok.length > 1
  const items = ok
    .flatMap((row) =>
      row.result.items.map((item) => {
        const who = row.result.email.split('@')[0]
        return {
          ...item,
          mailbox: row.result.email,
          label: multi ? `${who} · ${item.label}` : item.label,
        }
      })
    )
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))

  const span = Math.max(1, Math.min(Number(days) || 1, 14))
  return {
    emails: ok.map((row) => row.result.email),
    email: ok.length === 1 ? ok[0].result.email : '',
    title:
      ok.length > 1
        ? span > 1
          ? `Schedule · ${ok.length} mailboxes · next ${span} days`
          : `Today's Schedule · ${ok.length} mailboxes`
        : ok[0].result.title,
    items,
    errors,
    syncedAt: new Date().toISOString(),
    count: items.length,
  }
}

export function isMicrosoftConfigured() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)
}
