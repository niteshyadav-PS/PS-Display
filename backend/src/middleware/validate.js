import { HttpError } from './errorHandler.js'

/**
 * Validate and replace req.body / req.query / req.params from a Zod schema.
 * Keeps routes free of hand-rolled String(x).trim() checks.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => {
          const field = issue.path.join('.')
          return field ? `${field}: ${issue.message}` : issue.message
        })
        .join('; ')
      return next(new HttpError(400, detail || 'Invalid request'))
    }
    req[source] = result.data
    next()
  }
}
