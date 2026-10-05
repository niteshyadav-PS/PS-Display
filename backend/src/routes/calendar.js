import { Router } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import User from '../models/User.js'
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
    google: isGoogleOAuthConfigured(),
    configured: isGoogleOAuthConfigured(),
    provider: 'google',
    connected: Boolean(req.user.googleRefreshToken),
    googleEmail: req.user.googleEmail || '',
  })
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

router.post('/google', requireAuth, async (req, res) => {
  try {
    const { days } = req.body || {}

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

export default router
