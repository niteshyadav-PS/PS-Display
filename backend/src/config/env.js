import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.join(__dirname, '../../.env') })

const NODE_ENV = process.env.NODE_ENV || 'development'
const isProd = NODE_ENV === 'production'

const WEAK_SECRETS = new Set([
  'change-me',
  'secret',
  'changeme',
  'dev',
  'test',
  'ps-display-dev-secret-change-in-production',
  'insecure-dev-secret-do-not-use',
])

/** Collected startup problems so we can report them all at once instead of one per restart. */
const fatal = []
const warnings = []

function required(key, { allowInDev } = {}) {
  const value = (process.env[key] || '').trim()
  if (value) return value
  if (isProd || !allowInDev) fatal.push(`${key} is required`)
  else warnings.push(`${key} is not set — using an insecure development default`)
  return ''
}

const jwtSecret = required('JWT_SECRET', { allowInDev: true }) || 'insecure-dev-secret-do-not-use'

if (jwtSecret && WEAK_SECRETS.has(jwtSecret.toLowerCase())) {
  const message = `JWT_SECRET is set to the placeholder "${jwtSecret}" — generate a real one`
  if (isProd) fatal.push(message)
  else warnings.push(message)
} else if (jwtSecret.length < 32) {
  const message = 'JWT_SECRET should be at least 32 characters'
  if (isProd) fatal.push(message)
  else warnings.push(message)
}

function parseOrigins() {
  const raw = (process.env.CORS_ORIGINS || '').trim()
  if (raw) {
    return raw
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
  }

  // Fall back to the known client apps so a default install still works.
  return [process.env.CLIENT_URL, process.env.DISPLAY_PLAYER_URL]
    .filter(Boolean)
    .map((o) => o.trim().replace(/\/$/, ''))
}

const mongoUri = (process.env.MONGODB_URI || '').trim()
if (isProd && !mongoUri) fatal.push('MONGODB_URI is required')
if (isProd && /localhost|127\.0\.0\.1/.test(mongoUri)) {
  fatal.push('MONGODB_URI must be the Atlas connection string in production')
}

const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: mongoUri || 'mongodb://127.0.0.1:27017/ps-display',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, ''),
  playerUrl: (process.env.DISPLAY_PLAYER_URL || 'http://localhost:5174').replace(/\/$/, ''),
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  corsOrigins: parseOrigins(),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,
  maxProxyBytes: Number(process.env.MAX_PROXY_MB || 25) * 1024 * 1024,
  /** A display is considered online if it polled within this window. */
  displayOfflineAfterMs: Number(process.env.DISPLAY_OFFLINE_AFTER_SEC || 90) * 1000,
}

export function assertEnv() {
  for (const warning of warnings) {
    console.warn(`[config] ${warning}`)
  }
  if (fatal.length) {
    console.error('[config] Cannot start — fix these environment problems:')
    for (const problem of fatal) console.error(`  - ${problem}`)
    process.exit(1)
  }
}

export default config
