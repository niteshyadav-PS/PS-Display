/**
 * Dayparting rules. Mirrors backend/src/lib/schedule.js — the player must be able
 * to evaluate schedules with no network, so the logic lives on both sides.
 */

function toMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function localParts(date, timezone) {
  if (!timezone) {
    return {
      minutes: date.getHours() * 60 + date.getMinutes(),
      day: date.getDay(),
      ymd: [date.getFullYear(), date.getMonth() + 1, date.getDate()],
    }
  }

  try {
    const parts = {}
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
    for (const part of formatter.formatToParts(date)) parts[part.type] = part.value

    const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const hour = Number(parts.hour) % 24

    return {
      minutes: hour * 60 + Number(parts.minute),
      day: weekdays[parts.weekday] ?? date.getDay(),
      ymd: [Number(parts.year), Number(parts.month), Number(parts.day)],
    }
  } catch {
    return localParts(date, '')
  }
}

function compareToDateOnly(ymd, boundary) {
  const b = new Date(boundary)
  if (Number.isNaN(b.getTime())) return 0
  const left = ymd[0] * 10000 + ymd[1] * 100 + ymd[2]
  const right = b.getFullYear() * 10000 + (b.getMonth() + 1) * 100 + b.getDate()
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function isScheduleActive(schedule, now = new Date()) {
  if (!schedule || !schedule.enabled) return true

  const { minutes, day, ymd } = localParts(now, schedule.timezone)

  if (schedule.startDate && compareToDateOnly(ymd, schedule.startDate) < 0) return false
  if (schedule.endDate && compareToDateOnly(ymd, schedule.endDate) > 0) return false

  const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : []
  if (days.length && !days.includes(day)) return false

  const start = toMinutes(schedule.startTime)
  const end = toMinutes(schedule.endTime)

  if (start !== null && end !== null) {
    if (start === end) return true
    if (start > end) return minutes >= start || minutes < end
    return minutes >= start && minutes < end
  }
  if (start !== null) return minutes >= start
  if (end !== null) return minutes < end

  return true
}

export function describeSchedule(schedule) {
  if (!schedule || !schedule.enabled) return 'Always on'

  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const parts = []
  const days = Array.isArray(schedule.daysOfWeek) ? [...schedule.daysOfWeek].sort() : []

  if (days.length && days.length < 7) {
    const isWeekdays = days.length === 5 && days.every((d) => d >= 1 && d <= 5)
    parts.push(isWeekdays ? 'Mon–Fri' : days.map((d) => labels[d]).join(', '))
  }
  if (schedule.startTime || schedule.endTime) {
    parts.push(`${schedule.startTime || '00:00'}–${schedule.endTime || '24:00'}`)
  }

  return parts.length ? parts.join(' · ') : 'Always on'
}
