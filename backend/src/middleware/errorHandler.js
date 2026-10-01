import config from '../config/env.js'

/** Wrap an async route so thrown errors reach the error handler instead of hanging. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function notFound(req, res) {
  res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` })
}

/** Translate known error shapes into safe client messages; never leak internals in production. */
export function errorHandler(err, _req, res, _next) {
  let status = Number(err.status || err.statusCode) || 500
  let message = err.message || 'Server error'

  if (err.name === 'ValidationError') {
    status = 400
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(', ') || 'Validation failed'
  } else if (err.name === 'CastError') {
    status = 400
    message = 'Invalid identifier'
  } else if (err.code === 11000) {
    status = 409
    message = 'That value is already in use'
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413
    message = `File is larger than the ${Math.round(config.maxUploadBytes / 1048576)}MB limit`
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401
    message = 'Invalid or expired token'
  }

  if (status >= 500) {
    console.error(err)
    if (config.isProd) message = 'Something went wrong. Please try again.'
  }

  res.status(status).json({ message })
}
