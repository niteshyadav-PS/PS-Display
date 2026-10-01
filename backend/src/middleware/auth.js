import jwt from 'jsonwebtoken'
import config from '../config/env.js'
import User from '../models/User.js'
import { HttpError } from './errorHandler.js'

export function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
    if (!token) throw new HttpError(401, 'Authentication required')

    const payload = jwt.verify(token, config.jwtSecret)
    const user = await User.findById(payload.id)
    if (!user) throw new HttpError(401, 'User not found')

    // Normalize legacy roles (Content Manager / Viewer → User)
    if (user.role !== 'Administrator' && user.role !== 'User') {
      user.role = 'User'
      await user.save()
    }

    req.user = user
    next()
  } catch (err) {
    if (err instanceof HttpError) return next(err)
    return next(new HttpError(401, 'Invalid or expired token'))
  }
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'Administrator') {
    return next(new HttpError(403, 'Administrator access required'))
  }
  next()
}
