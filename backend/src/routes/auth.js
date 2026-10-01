import { Router } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import config from '../config/env.js'
import User from '../models/User.js'
import Display from '../models/Display.js'
import Media from '../models/Media.js'
import SupportRequest from '../models/SupportRequest.js'
import { requireAuth, requireAdmin, signToken } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../middleware/errorHandler.js'
import { authLimiter } from '../middleware/rateLimit.js'
import { uploadsDir } from './media.js'
import { validate } from '../middleware/validate.js'
import {
  changePasswordSchema,
  contactAdminSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  updateMeSchema,
  updateUserSchema,
} from '../validation/schemas.js'

const router = Router()
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { password } = req.body
    const username = String(req.body.username || '').trim().toLowerCase()
    if (!username || username.includes('@')) {
      throw new HttpError(401, 'Invalid username or password')
    }
    const user = await User.findOne({ username }).select('+password')
    if (!user || !(await user.comparePassword(password))) {
      throw new HttpError(401, 'Invalid username or password')
    }

    user.lastLoginAt = new Date()
    await user.save({ validateBeforeSave: false })

    res.json({ token: signToken(user), user: user.toSafeJSON() })
  })
)

router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body
    const user = await User.findOne({ email })

    // Always answer the same way so the form cannot be used to discover accounts.
    const generic = { message: 'If that email exists, reset instructions were sent.' }

    if (!user) return res.json(generic)

    const token = crypto.randomBytes(32).toString('hex')
    user.resetTokenHash = hashResetToken(token)
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
    await user.save({ validateBeforeSave: false })

    const resetUrl = `${config.clientUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

    // No mail transport is wired up yet, so surface the link where an operator can find it.
    console.log(`[auth] Password reset link for ${email}: ${resetUrl}`)

    if (!config.isProd) return res.json({ ...generic, resetUrl })
    return res.json(generic)
  })
)

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || '').trim()
    const password = String(req.body?.password || '')

    if (!token) throw new HttpError(400, 'Reset token is required')
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')

    const user = await User.findOne({
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiresAt')

    if (!user) throw new HttpError(400, 'That reset link is invalid or has expired')

    user.password = password
    user.resetTokenHash = ''
    user.resetTokenExpiresAt = null
    await user.save()

    res.json({ message: 'Password updated. You can now sign in.' })
  })
)

router.post(
  '/contact-admin',
  authLimiter,
  validate(contactAdminSchema),
  asyncHandler(async (req, res) => {
    await SupportRequest.create(req.body)
    res.status(201).json({ message: 'Request submitted. An admin will contact you soon.' })
  })
)

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() })
})

router.put(
  '/me',
  requireAuth,
  validate(updateMeSchema),
  asyncHandler(async (req, res) => {
    const { email, ...rest } = req.body
    if (email && email !== req.user.email) {
      const exists = await User.findOne({ email, _id: { $ne: req.user._id } })
      if (exists) throw new HttpError(409, 'Email already registered')
      req.user.email = email
    }
    Object.assign(req.user, rest)
    await req.user.save()
    res.json({ user: req.user.toSafeJSON() })
  })
)

router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body

    const user = await User.findById(req.user._id).select('+password')
    if (!(await user.comparePassword(currentPassword))) {
      throw new HttpError(401, 'Current password is incorrect')
    }
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'New password must be different from the current one')
    }

    user.password = newPassword
    await user.save()
    res.json({ message: 'Password updated successfully' })
  })
)

router.get(
  '/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [users, displays] = await Promise.all([
      User.find().sort({ createdAt: -1 }),
      Display.find()
        .select('name department published createdBy updatedAt')
        .sort({ updatedAt: -1 })
        .lean(),
    ])
    const byOwner = new Map()
    for (const display of displays) {
      const key = String(display.createdBy || '')
      const list = byOwner.get(key) || []
      list.push({
        id: display._id,
        name: display.name,
        department: display.department || '',
        published: Boolean(display.published),
      })
      byOwner.set(key, list)
    }
    res.json({
      users: users.map((u) => ({
        ...u.toSafeJSON(),
        displays: byOwner.get(String(u._id)) || [],
      })),
    })
  })
)

router.post(
  '/users',
  requireAuth,
  requireAdmin,
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const username = String(req.body.username).trim().toLowerCase()
    const usernameTaken = await User.findOne({ username })
    if (usernameTaken) throw new HttpError(409, 'Username already registered')

    const email = String(req.body.email || '').trim().toLowerCase() || `${username}@users.local`
    const emailTaken = await User.findOne({ email })
    if (emailTaken) throw new HttpError(409, 'Email already registered')

    const user = await User.create({
      ...req.body,
      username,
      email,
    })
    res.status(201).json({ user: user.toSafeJSON() })
  })
)

router.put(
  '/users/:id',
  requireAuth,
  requireAdmin,
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id)
    if (!target) throw new HttpError(404, 'User not found')

    const { username, role, password, email, mailConnected, ...rest } = req.body

    if (username && username !== target.username) {
      const exists = await User.findOne({ username, _id: { $ne: target._id } })
      if (exists) throw new HttpError(409, 'Username already registered')
      target.username = username
      if (!email && (!target.email || String(target.email).endsWith('@users.local'))) {
        target.email = `${username}@users.local`
      }
    }

    if (email) {
      if (email !== target.email) {
        const exists = await User.findOne({ email, _id: { $ne: target._id } })
        if (exists) throw new HttpError(409, 'Email already registered')
        target.email = email
      }
      if (mailConnected) target.mailConnected = true
    }

    if (role) {
      const isSelf = String(target._id) === String(req.user._id)
      if (isSelf && role !== 'Administrator') {
        throw new HttpError(400, 'You cannot remove your own administrator role')
      }
      target.role = role
    }

    Object.assign(target, rest)
    if (password) {
      target.password = password
      target.markModified('password')
    }

    await target.save()
    res.json({ user: target.toSafeJSON() })
  })
)

router.delete(
  '/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (String(req.user._id) === String(req.params.id)) {
      throw new HttpError(400, 'You cannot delete your own account')
    }
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) throw new HttpError(404, 'User not found')

    const media = await Media.find({ uploadedBy: user._id }).select('url').lean()
    await Promise.all([
      Display.deleteMany({ createdBy: user._id }),
      Media.deleteMany({ uploadedBy: user._id }),
    ])
    await Promise.all(
      media.map((item) => {
        if (!item.url?.startsWith('/uploads/')) return Promise.resolve()
        const filePath = path.join(uploadsDir, path.basename(item.url))
        if (!filePath.startsWith(uploadsDir)) return Promise.resolve()
        return fs.promises.unlink(filePath).catch(() => {})
      })
    )

    res.json({ message: 'User deleted' })
  })
)

router.get(
  '/support-requests',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const requests = await SupportRequest.find().sort({ createdAt: -1 }).limit(100)
    res.json({ requests })
  })
)

router.put(
  '/support-requests/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.body?.status === 'Resolved' ? 'Resolved' : 'Open'
    const request = await SupportRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        resolvedBy: status === 'Resolved' ? req.user._id : null,
        resolvedAt: status === 'Resolved' ? new Date() : null,
      },
      { new: true }
    )
    if (!request) throw new HttpError(404, 'Request not found')
    res.json({ request })
  })
)

export default router
