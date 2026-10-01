/** Page-level visual overlays — atmosphere + event (birthday / celebration). */
export const OVERLAY_PRESETS = [
  { id: 'none', label: 'None', group: 'off', icon: '⊘', tint: '#94a3b8' },
  { id: 'birthday', label: 'Birthday', group: 'event', icon: '🎂', tint: '#f472b6' },
  { id: 'balloons', label: 'Balloons', group: 'event', icon: '🎈', tint: '#38bdf8' },
  { id: 'celebration', label: 'Celebration', group: 'event', icon: '🎉', tint: '#f59e0b' },
  { id: 'hearts', label: 'Hearts', group: 'event', icon: '❤️', tint: '#fb7185' },
  { id: 'anniversary', label: 'Anniversary', group: 'event', icon: '🥂', tint: '#a78bfa' },
  { id: 'confetti', label: 'Confetti', group: 'event', icon: '🎊', tint: '#8bc53f' },
  { id: 'snowfall', label: 'Snowfall', group: 'mood', icon: '❄', tint: '#7dd3fc' },
  { id: 'vignette', label: 'Vignette', group: 'mood', icon: '◐', tint: '#64748b' },
  { id: 'dim', label: 'Dim', group: 'mood', icon: '🌙', tint: '#475569' },
  { id: 'soft-glow', label: 'Soft glow', group: 'mood', icon: '✨', tint: '#fde68a' },
  { id: 'brand-wash', label: 'Brand wash', group: 'mood', icon: '🟩', tint: '#8bc53f' },
  { id: 'scanlines', label: 'Scanlines', group: 'mood', icon: '▤', tint: '#94a3b8' },
]

export const OVERLAY_SCHEDULE_MODES = [
  { id: 'always', label: 'Always on' },
  { id: 'range', label: 'Date range' },
  { id: 'annual', label: 'Every year (birthday)' },
]

const OVERLAY_IDS = new Set(OVERLAY_PRESETS.map((p) => p.id))

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDateKey(value) {
  if (!value || typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  return d
}

export function normalizeOverlay(overlay) {
  const type = OVERLAY_IDS.has(overlay?.type) ? overlay.type : 'none'
  const opacity = Math.min(1, Math.max(0, Number(overlay?.opacity) || 0.55))
  const message = String(overlay?.message || '').slice(0, 120)
  const scheduleMode = OVERLAY_SCHEDULE_MODES.some((m) => m.id === overlay?.scheduleMode)
    ? overlay.scheduleMode
    : 'always'
  const startDate = String(overlay?.startDate || '').slice(0, 10)
  const endDate = String(overlay?.endDate || '').slice(0, 10)
  const month = Math.min(12, Math.max(1, Number(overlay?.month) || 1))
  const day = Math.min(31, Math.max(1, Number(overlay?.day) || 1))
  const daysBefore = Math.min(30, Math.max(0, Number(overlay?.daysBefore) || 0))
  return {
    type,
    opacity,
    message,
    scheduleMode,
    startDate,
    endDate,
    month,
    day,
    daysBefore,
  }
}

/** Whether this overlay should render on the live player right now. */
export function isOverlayActive(overlay, now = new Date()) {
  const cfg = normalizeOverlay(overlay)
  if (cfg.type === 'none') return false

  if (cfg.scheduleMode === 'always') return true

  if (cfg.scheduleMode === 'range') {
    const start = parseDateKey(cfg.startDate)
    const end = parseDateKey(cfg.endDate || cfg.startDate)
    if (!start) return false
    const today = parseDateKey(toDateKey(now))
    const endDay = end || start
    return today >= start && today <= endDay
  }

  if (cfg.scheduleMode === 'annual') {
    const year = now.getFullYear()
    // Handle Feb 29 → Feb 28 on non-leap years
    const event = new Date(year, cfg.month - 1, cfg.day)
    if (event.getMonth() !== cfg.month - 1) {
      event.setDate(0)
    }
    const windowStart = new Date(event)
    windowStart.setDate(windowStart.getDate() - cfg.daysBefore)
    const today = parseDateKey(toDateKey(now))
    return today >= windowStart && today <= event
  }

  return true
}

export function overlayPreviewLabel(overlay) {
  const cfg = normalizeOverlay(overlay)
  if (cfg.type === 'none') return 'Off'
  if (cfg.scheduleMode === 'always') return 'Always on'
  if (cfg.scheduleMode === 'range') {
    if (!cfg.startDate) return 'Needs start date'
    return `${cfg.startDate}${cfg.endDate && cfg.endDate !== cfg.startDate ? ` → ${cfg.endDate}` : ''}`
  }
  const when =
    cfg.daysBefore > 0
      ? `${cfg.daysBefore}d before ${pad2(cfg.month)}/${pad2(cfg.day)}`
      : `Every ${pad2(cfg.month)}/${pad2(cfg.day)}`
  return when
}
