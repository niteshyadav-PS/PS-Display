import { Router } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import User from '../models/User.js'
import { fetchCalendarsByEmails, isMicrosoftConfigured } from '../services/msGraph.js'
import { fetchGoogleCalendarByEmail, isGoogleConfigured } from '../services/googleCalendar.js'
import {
  exchangeGoogleCode,
  fetchGoogleCalendarForUser,
  fetchSharedGoogleCalendars,
  getGoogleAuthUrl,
  isGoogleOAuthConfigured,
} from '../services/googleOAuth.js'

const router = Router()

router.get('/status', requireAuth, (req, res) => {
  res.json({
    googleOAuth: isGoogleOAuthConfigured(),
    googleServiceAccount: isGoogleConfigured(),
    google: isGoogleOAuthConfigured() || isGoogleConfigured(),
    microsoft: isMicrosoftConfigured(),
    departmentGoogle: (req.user.departmentGoogle || []).map((row) => ({
      department: row.department,
      googleEmail: row.googleEmail || '',
      connected: Boolean(row.googleRefreshToken),
    })),
    configured: isGoogleOAuthConfigured() || isGoogleConfigured(),
    provider: 'google',
    connected: Boolean(req.user.googleRefreshToken),
    googleEmail: req.user.googleEmail || '',
  })
})

function normalizeMailboxList(mails) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(mails) ? mails : []) {
    const email = String(raw || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
    if (out.length >= 8) break
  }
  return out
}

router.put('/microsoft/mails', requireAuth, async (req, res) => {
  try {
    const mails = normalizeMailboxList(req.body?.mails)
    req.user.microsoftMails = mails
    await req.user.save()
    res.json({
      message: 'Microsoft mailboxes saved',
      microsoftMails: mails,
      user: req.user.toSafeJSON(),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/google/connect', requireAuth, (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({
        message:
          'Google OAuth not configured. Create an OAuth Client ID in Google Cloud and set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.',
      })
    }
    const returnTo = String(req.query.returnTo || '').trim() === 'editor' ? 'editor' : 'settings'
    const department = String(req.query.department || '').trim().slice(0, 120)
    const forUser = String(req.query.forUser || '').trim()
    if (forUser && req.user.role !== 'Administrator' && String(req.user._id) !== forUser) {
      return res.status(403).json({ message: 'You cannot connect email for this account' })
    }
    const state = jwt.sign(
      { uid: String(req.user._id), purpose: 'google-oauth', returnTo, department, forUser },
      config.jwtSecret,
      { expiresIn: '15m' }
    )
    const url = getGoogleAuthUrl(state)
    res.json({ url })
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message })
  }
})

router.get('/google/callback', async (req, res) => {
  const clientUrl = config.clientUrl
  try {
    const { code, state, error } = req.query
    if (error) {
      return res.redirect(`${clientUrl}/app/settings?google=denied`)
    }
    if (!code || !state) {
      return res.redirect(`${clientUrl}/app/settings?google=error`)
    }

    const payload = jwt.verify(String(state), config.jwtSecret)
    if (payload.purpose !== 'google-oauth' || !payload.uid) {
      return res.redirect(`${clientUrl}/app/settings?google=error`)
    }

    const tokens = await exchangeGoogleCode(String(code))
    const actor = await User.findById(payload.uid)
    if (!actor) return res.redirect(`${clientUrl}/app/settings?google=error`)

    const forUser = String(payload.forUser || '').trim()
    const user = forUser ? await User.findById(forUser) : actor
    if (!user) return res.redirect(`${clientUrl}/app/settings?google=error`)

    // Google only returns a refresh_token on the first consent (or with prompt=consent).
    // Never mark the account connected without one — a stale token causes "expired" on fetch.
    const department = String(payload.department || '').trim()
    if (department && !forUser) {
      const list = Array.isArray(user.departmentGoogle) ? [...user.departmentGoogle] : []
      const index = list.findIndex(
        (row) => String(row.department || '').toLowerCase() === department.toLowerCase()
      )
      const previous = index >= 0 ? list[index] : null
      const refreshToken = tokens.refreshToken || previous?.googleRefreshToken || ''
      if (!refreshToken) return res.redirect(`${clientUrl}/app/settings?google=error`)
      const entry = {
        department,
        googleEmail: tokens.email || previous?.googleEmail || '',
        googleRefreshToken: refreshToken,
        googleConnectedAt: new Date(),
      }
      if (index >= 0) list[index] = entry
      else list.push(entry)
      user.departmentGoogle = list
      user.markModified('departmentGoogle')
    } else {
      if (tokens.refreshToken) {
        user.googleRefreshToken = tokens.refreshToken
      } else if (!user.googleRefreshToken) {
        return res.redirect(`${clientUrl}/app/settings?google=error`)
      }
      if (tokens.email) user.googleEmail = tokens.email
      user.googleConnectedAt = new Date()
      user.mailConnected = false
      await user.save()
      try {
        await fetchGoogleCalendarForUser(user, { days: 1 })
      } catch (err) {
        user.googleRefreshToken = ''
        user.googleEmail = ''
        user.googleConnectedAt = undefined
        user.mailConnected = false
        await user.save()
        console.error('Google calendar fetch after connect failed', err)
        return res.redirect(`${clientUrl}/app/settings?google=fetch-failed`)
      }
      user.mailConnected = true
    }
    await user.save()

    const returnTo = '/app/settings'
    return res.redirect(`${clientUrl}${returnTo}?google=connected`)
  } catch (err) {
    console.error('Google OAuth callback failed', err)
    return res.redirect(`${clientUrl}/app/settings?google=error`)
  }
})

router.post('/google/disconnect', requireAuth, async (req, res) => {
  try {
    const department = String(req.body?.department || '').trim()
    if (department) {
      req.user.departmentGoogle = (req.user.departmentGoogle || []).filter(
        (row) => String(row.department || '').toLowerCase() !== department.toLowerCase()
      )
      req.user.markModified('departmentGoogle')
    } else {
      req.user.googleRefreshToken = ''
      req.user.googleEmail = ''
      req.user.googleConnectedAt = undefined
    }
    await req.user.save()
    res.json({ message: 'Google Calendar disconnected', user: req.user.toSafeJSON() })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/google/disconnect-user', requireAuth, async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim()
    if (!userId) return res.status(400).json({ message: 'Choose a user' })
    if (req.user.role !== 'Administrator' && String(req.user._id) !== userId) {
      return res.status(403).json({ message: 'You cannot remove this email' })
    }
    const target = await User.findById(userId)
    if (!target) return res.status(404).json({ message: 'User not found' })
    target.googleRefreshToken = ''
    target.googleEmail = ''
    target.googleConnectedAt = undefined
    target.mailConnected = false
    await target.save()
    res.json({ message: 'Email disconnected', user: target.toSafeJSON() })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/google/department', requireAuth, async (req, res) => {
  try {
    const department = String(req.body?.department || '').trim()
    if (!department) {
      return res.status(400).json({ message: 'Choose a department for this display.' })
    }
    const people = await User.find({
      department: new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      mailConnected: true,
      googleRefreshToken: { $nin: ['', null] },
    }).select('name email googleEmail googleRefreshToken')

    if (!people.length) {
      return res.status(400).json({
        message: `No one in ${department} has connected an email yet. Open Settings → All users and connect each person’s Google calendar.`,
      })
    }

    const colors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
    const legend = []
    const items = []
    const errors = []
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index]
      const color = colors[index % colors.length]
      const who = person.name || person.googleEmail || person.email
      try {
        const result = await fetchGoogleCalendarForUser(person, { days: req.body?.days })
        legend.push({ name: who, email: result.email || person.googleEmail, color })
        for (const item of result.items || []) {
          items.push({
            ...item,
            color,
            calendar: who,
            label: `${who} · ${item.subject || item.label || 'Meeting'}`,
          })
        }
      } catch (err) {
        errors.push({ email: person.googleEmail || person.email, message: err.message })
      }
    }
    items.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))
    if (!legend.length) {
      return res.status(502).json({
        message: errors[0]?.message || 'Could not fetch the connected calendars.',
      })
    }
    res.json({
      department,
      email: legend.map((row) => row.email).filter(Boolean).join(', '),
      title: `${department} · ${legend.length} calendars`,
      items,
      legend,
      errors,
      syncedAt: new Date().toISOString(),
      count: items.length,
      source: 'google-users',
    })
  } catch (err) {
    console.error('Department Google calendar fetch failed:', err?.message || err)
    const status = err.status || 500
    res.status(status >= 400 && status < 600 ? status : 500).json({
      message: err.message || 'Department Google calendar fetch failed',
    })
  }
})

router.post('/google', requireAuth, async (req, res) => {
  try {
    const { email, days } = req.body || {}

    // Prefer OAuth (works with personal Gmail)
    if (req.user.googleRefreshToken) {
      const result = await fetchSharedGoogleCalendars(req.user.googleRefreshToken, {
        days,
        email: req.user.googleEmail,
        accountName: req.user.name,
      })
      const addresses = [
        ...new Set(
          (result.legend || [])
            .map((row) => String(row.email || '').trim().toLowerCase())
            .filter((value) => value.includes('@'))
        ),
      ]
      const people = addresses.length
        ? await User.find({
            $or: [{ googleEmail: { $in: addresses } }, { email: { $in: addresses } }],
          }).select('name email googleEmail')
        : []
      const names = new Map()
      if (req.user.googleEmail && req.user.name) {
        names.set(String(req.user.googleEmail).toLowerCase(), req.user.name)
      }
      for (const person of people) {
        if (!person.name) continue
        if (person.googleEmail) names.set(String(person.googleEmail).toLowerCase(), person.name)
        if (person.email) names.set(String(person.email).toLowerCase(), person.name)
      }
      const items = (result.items || []).map((item) => {
        const who = names.get(String(item.calendarId || '').toLowerCase()) || item.calendar
        const place = item.location ? ` · ${item.location}` : ''
        return {
          ...item,
          calendar: who,
          label: who ? `${who} · ${item.subject || 'Meeting'}${place}` : item.label,
        }
      })
      return res.json({
        ...result,
        items,
        count: items.length,
      })
    }

    // Fallback: service account (Workspace / shared calendars only)
    if (isGoogleConfigured()) {
      const result = await fetchGoogleCalendarByEmail(email || req.user.googleEmail, { days })
      return res.json(result)
    }

    return res.status(400).json({
      message:
        'Connect Google first (personal Gmail cannot be shared with a service account). Click Connect Google Account.',
    })
  } catch (err) {
    console.error('Google Calendar fetch failed:', err?.message || err)
    const status = err.status || 500
    let message = err.message || 'Google Calendar fetch failed'
    const raw = String(err.message || err.cause || '')
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(raw)) {
      message =
        'Could not reach Google Calendar. Check this PC’s internet connection and try again.'
    }
    if (/invalid_grant|expired|revoked|Failed to refresh Google/i.test(raw)) {
      // Drop the dead token so the UI shows "Connect" instead of a false "Connected".
      try {
        req.user.googleRefreshToken = ''
        req.user.googleConnectedAt = undefined
        await req.user.save()
      } catch {
        // ignore
      }
      message =
        'Google connection expired. Disconnect is done — click Connect Google Account again, then fetch meetings.'
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({
      message,
      connected: Boolean(req.user.googleRefreshToken),
    })
  }
})

router.get('/departments', requireAuth, async (req, res) => {
  try {
    const people = await User.find({ department: { $nin: ['', null] } })
      .select('name email department')
      .sort({ name: 1 })
      .lean()
    const groups = new Map()
    for (const person of people) {
      const department = String(person.department || '').trim()
      if (!department) continue
      const key = department.toLowerCase()
      if (!groups.has(key)) groups.set(key, { department, employees: [] })
      groups.get(key).employees.push({
        name: person.name,
        email: person.email,
      })
    }
    res.json({
      departments: [...groups.values()].sort((a, b) => a.department.localeCompare(b.department)),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/microsoft/department', requireAuth, async (req, res) => {
  try {
    if (!isMicrosoftConfigured()) {
      return res.status(503).json({
        message:
          'Microsoft Calendar is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET in backend/.env',
      })
    }

    const department = String(req.body?.department || '').trim()
    if (!department) {
      return res.status(400).json({ message: 'Choose a department for this display.' })
    }

    const people = await User.find({
      department: new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select('name email')
      .sort({ name: 1 })
      .lean()

    const employees = people
      .map((person) => ({
        name: person.name,
        email: String(person.email || '').trim().toLowerCase(),
      }))
      .filter((person) => person.email.includes('@'))
      .slice(0, 40)

    if (!employees.length) {
      return res.status(400).json({
        message: `No employees found in ${department}. Create them under Create User and set this department. Their login email must be their Microsoft mailbox.`,
      })
    }

    const result = await fetchCalendarsByEmails(
      employees.map((person) => person.email),
      { days: req.body?.days }
    )
    const byEmail = new Map(employees.map((person) => [person.email, person.name]))
    const items = (result.items || []).map((item) => {
      const who = byEmail.get(String(item.mailbox || '').toLowerCase()) || item.mailbox
      const place = item.location ? ` · ${item.location}` : ''
      return {
        ...item,
        label: `${who} · ${item.subject || 'Meeting'}${place}`,
      }
    })

    res.json({
      ...result,
      items,
      count: items.length,
      department,
      employees,
      title: `${department} · ${employees.length} people`,
    })
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Department calendar fetch failed' })
  }
})

router.post('/microsoft', requireAuth, async (req, res) => {
  try {
    if (!isMicrosoftConfigured()) {
      return res.status(503).json({
        message:
          'Microsoft Calendar is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET in backend/.env',
      })
    }

    const saved = normalizeMailboxList(req.user.microsoftMails)
    if (!saved.length) {
      return res.status(400).json({
        message: 'Add mailbox addresses for this account in Settings, then fetch meetings.',
      })
    }

    const requested = normalizeMailboxList(
      req.body?.emails || (req.body?.email ? [req.body.email] : saved)
    )
    const allowed = new Set(saved)
    const emails = requested.filter((email) => allowed.has(email))
    if (!emails.length) {
      return res.status(400).json({
        message: 'Those mailboxes are not on this account. Add them in Settings first.',
      })
    }

    const result = await fetchCalendarsByEmails(emails, { days: req.body?.days })
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Microsoft Calendar fetch failed' })
  }
})

export default router
