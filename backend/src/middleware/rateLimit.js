import rateLimit from 'express-rate-limit'

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down and try again shortly.' },
}

/** Tight limit on credential endpoints to stop password guessing. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts. Please wait 15 minutes and try again.' },
})

/** Broad limit for the authenticated API surface. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 300,
})

/** Players poll frequently, so they get a higher ceiling than the admin API. */
export const playerLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 120,
})

/** Proxying is expensive, so keep it modest. */
export const proxyLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 60,
})

export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 100,
})
