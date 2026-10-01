import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, HttpError } from '../middleware/errorHandler.js'
import { playerLimiter } from '../middleware/rateLimit.js'

const router = Router()

/**
 * Live weather via Open-Meteo (no API key required).
 * Results are cached in-process so a wall of screens polling the same city
 * does not hammer the upstream service.
 */
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map()

const WMO_CONDITIONS = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  56: 'Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Light Showers',
  81: 'Showers',
  82: 'Heavy Showers',
  85: 'Snow Showers',
  86: 'Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, Hail',
  99: 'Thunderstorm, Hail',
}

async function getJson(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new HttpError(502, 'Weather service is unavailable')
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new HttpError(504, 'Weather service timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=1&language=en&format=json`
  const data = await getJson(url)
  const hit = data?.results?.[0]
  if (!hit) throw new HttpError(404, `Could not find a place called "${city}"`)
  return {
    name: hit.name,
    country: hit.country_code || hit.country || '',
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone || 'auto',
  }
}

router.get(
  '/',
  playerLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const city = String(req.query.city || '').trim()
    const units = req.query.units === 'imperial' ? 'imperial' : 'metric'
    if (!city) throw new HttpError(400, 'A city is required')

    const cacheKey = `${city.toLowerCase()}|${units}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.json({ ...cached.value, cached: true })
    }

    const place = await geocode(city)
    const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius'
    const windUnit = units === 'imperial' ? 'mph' : 'kmh'

    const forecast = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`
    )

    const current = forecast?.current || {}
    const daily = forecast?.daily || {}

    const value = {
      location: place.country ? `${place.name}, ${place.country}` : place.name,
      temp: Math.round(Number(current.temperature_2m ?? 0)),
      feelsLike: Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
      humidity: Number(current.relative_humidity_2m ?? 0),
      wind: Math.round(Number(current.wind_speed_10m ?? 0)),
      condition: WMO_CONDITIONS[current.weather_code] || 'Unknown',
      code: Number(current.weather_code ?? 0),
      unit: units === 'imperial' ? '°F' : '°C',
      forecast: (daily.time || []).slice(0, 3).map((date, i) => ({
        date,
        day: new Date(date).toLocaleDateString([], { weekday: 'short' }),
        max: Math.round(Number(daily.temperature_2m_max?.[i] ?? 0)),
        min: Math.round(Number(daily.temperature_2m_min?.[i] ?? 0)),
        condition: WMO_CONDITIONS[daily.weather_code?.[i]] || '',
      })),
      syncedAt: new Date().toISOString(),
    }

    cache.set(cacheKey, { at: Date.now(), value })
    res.json(value)
  })
)

export default router
