import express from 'express'
import cors from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import morgan from 'morgan'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

import config, { assertEnv } from './config/env.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import displayRoutes from './routes/displays.js'
import dashboardRoutes from './routes/dashboard.js'
import mediaRoutes, { uploadsDir } from './routes/media.js'
import webRoutes from './routes/web.js'
import calendarRoutes from './routes/calendar.js'
import weatherRoutes from './routes/weather.js'

assertEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(
  helmet({
    // Media and embeds are served cross-origin to the player / admin apps.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    // PDFs and uploads are shown inside <iframe> from :5173 / :5174 — SAMEORIGIN
    // would blank every remote PDF widget.
    frameguard: false,
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
  })
)
app.use(compression())

const allowedOrigins = new Set(config.corsOrigins)

/** Allow LAN origins (TV / phone) during local development without editing .env for every IP. */
function isPrivateLanOrigin(origin) {
  if (config.isProd) return false
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
    const m = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
    if (m) {
      const second = Number(m[1])
      return second >= 16 && second <= 31
    }
  } catch {
    return false
  }
  return false
}

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser callers (players, curl, native TV apps) send no Origin.
      if (!origin) return callback(null, true)
      const normalized = origin.replace(/\/$/, '')
      if (!config.isProd) return callback(null, true)
      if (!allowedOrigins.size || allowedOrigins.has(normalized) || isPrivateLanOrigin(normalized)) {
        return callback(null, true)
      }
      return callback(new Error(`Origin ${origin} is not allowed`))
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false, limit: '2mb' }))
app.use(morgan(config.isProd ? 'combined' : 'dev'))

app.use(
  '/uploads',
  express.static(uploadsDir || path.join(__dirname, '../uploads'), {
    maxAge: '7d',
    setHeaders(res, filePath) {
      // Never let an uploaded file be sniffed into something executable.
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // Explicitly allow the admin + player apps to iframe / play this file.
      res.removeHeader('X-Frame-Options')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      res.setHeader('Accept-Ranges', 'bytes')
      const lower = String(filePath || '').toLowerCase()
      if (lower.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'inline')
      } else if (lower.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4')
      } else if (lower.endsWith('.webm')) {
        res.setHeader('Content-Type', 'video/webm')
      } else if (lower.endsWith('.ogv') || lower.endsWith('.ogg')) {
        res.setHeader('Content-Type', 'video/ogg')
      }
    },
  })
)

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'ps-display-api', env: config.nodeEnv, uptime: process.uptime() })
)

app.use('/api', apiLimiter)
app.use('/api/auth', authRoutes)
app.use('/api/displays', displayRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/media', mediaRoutes)
app.use('/api/web', webRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/weather', weatherRoutes)

app.use('/api', notFound)
app.use(errorHandler)

let server

async function start() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  console.log('MongoDB connected')

  server = app.listen(config.port, '0.0.0.0', () =>
    console.log(`API running on http://0.0.0.0:${config.port} (${config.nodeEnv})`)
  )
}

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`)
  server?.close()
  await mongoose.connection.close().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})

export default app
