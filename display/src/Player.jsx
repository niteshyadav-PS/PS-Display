import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { isScheduleActive } from './lib/schedule'
import { readCache, writeCache, writePairedKey } from './lib/cache'
import { resolveApiUrl } from './lib/apiUrl'
import { enterFullscreen, exitFullscreen, isFullscreen, toggleFullscreen } from './lib/fullscreen'
import PdfViewer from './PdfViewer'
import VideoPlayer from './VideoPlayer'
import VisualOverlay from './components/VisualOverlay'

const API_URL = resolveApiUrl()
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')
const DESIGN_W = 1280
const DESIGN_H = 720
const BASE_POLL_MS = 15000
const MAX_POLL_MS = 120000

/** Stable fingerprint of what the screen should show (not poll metadata). */
function contentRevision(display) {
  if (!display) return ''
  try {
    return JSON.stringify({
      name: display.name,
      orientation: display.orientation,
      playbackStopped: Boolean(display.playbackStopped),
      schedule: display.schedule || null,
      pages: (display.pages || []).map((page) => ({
        id: page.id,
        name: page.name,
        durationSec: page.durationSec,
        backgroundColor: page.backgroundColor,
        backgroundImage: page.backgroundImage || '',
        backgroundFit: page.backgroundFit || 'cover',
        backgroundBrightness: page.backgroundBrightness ?? 100,
        overlay: page.overlay || null,
        schedule: page.schedule || null,
        widgets: page.widgets || [],
      })),
    })
  } catch {
    return String(display.updatedAt || '')
  }
}

function resolveMediaUrl(url, { preferDirect = false } = {}) {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw

  try {
    const parsed = raw.startsWith('/')
      ? new URL(raw, API_ORIGIN)
      : new URL(raw)
    // Always serve our uploads from the current API host (fixes localhost vs LAN IP).
    if (parsed.pathname.startsWith('/uploads/')) {
      return `${API_ORIGIN}${parsed.pathname}${parsed.search}`
    }
  } catch {
    // fall through
  }

  if (/^https?:\/\//i.test(raw)) {
    if (raw.startsWith(API_ORIGIN) || raw.includes('/api/media/proxy')) return raw
    // <video> can usually play remote files directly; the proxy buffers the whole
    // file and fails above ~25MB, so prefer a direct URL for video playback.
    if (preferDirect) return raw
    return `${API_URL}/media/proxy?url=${encodeURIComponent(raw)}`
  }
  return raw
}

function resolveVideoUrl(url) {
  return resolveMediaUrl(url, { preferDirect: true })
}

function shouldEmbedDirect(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.includes('powerbi.com') ||
      host.includes('fabric.microsoft.com') ||
      host.includes('app.powerbi.com') ||
      host.includes('msit.powerbi.com') ||
      (host.endsWith('.microsoft.com') && (host.includes('powerbi') || host.includes('fabric')))
    )
  } catch {
    return false
  }
}

function resolveWebEmbedUrl(url) {
  if (!url) return ''
  let next = String(url).trim()
  if (!next) return ''
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`
  if (next.includes('/api/web/embed?')) return next
  if (shouldEmbedDirect(next)) return next
  return `${API_URL}/web/embed?url=${encodeURIComponent(next)}`
}

function parseHex(color) {
  if (!color || typeof color !== 'string') return null
  const raw = color.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null
  const hex =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function isLightBackground(color) {
  const rgb = parseHex(color)
  if (!rgb) return true
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 155
}

function useStageScale(orientation = 'Landscape') {
  const [scale, setScale] = useState({
    factor: 1,
    width: DESIGN_W,
    height: DESIGN_H,
    offsetX: 0,
    offsetY: 0,
  })

  useEffect(() => {
    function update() {
      const portrait = orientation === 'Portrait'
      const designW = portrait ? DESIGN_H : DESIGN_W
      const designH = portrait ? DESIGN_W : DESIGN_H
      // Same as the editor: one uniform scale so the layout is never stretched.
      const factor = Math.min(window.innerWidth / designW, window.innerHeight / designH)
      setScale({
        factor,
        width: designW,
        height: designH,
        offsetX: (window.innerWidth - designW * factor) / 2,
        offsetY: (window.innerHeight - designH * factor) / 2,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [orientation])

  return scale
}

/** Ticks once a minute, aligned to the minute boundary, for clocks and schedules. */
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer
    function schedule() {
      const next = 60000 - (Date.now() % 60000) + 50
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, next)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  return now
}

function useSecondTick(enabled) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [enabled])
}

function WeatherWidget({ props, className }) {
  const [live, setLive] = useState(null)
  const city = (props.city || '').trim()

  // Without a city we can only show whatever was typed into the editor.
  useEffect(() => {
    if (!city) return undefined
    let alive = true

    async function load() {
      try {
        const res = await fetch(`${API_URL}/weather?city=${encodeURIComponent(city)}`)
        if (!res.ok) return
        const data = await res.json()
        if (alive) setLive(data)
      } catch {
        // Keep the last reading on failure.
      }
    }

    load()
    const timer = setInterval(load, 15 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [city])

  const temp = live ? live.temp : props.temp
  const unit = live ? live.unit : '°C'
  const condition = live ? live.condition : props.condition || 'Partly Cloudy'

  return (
    <div className={`${className} weather`}>
      <div>
        <div className="temp">
          {temp ?? '--'}
          <span className="temp-unit">{unit}</span>
        </div>
        <div className="muted">{condition}</div>
        {live?.location ? <div className="muted small">{live.location}</div> : null}
      </div>
    </div>
  )
}

function faceSize(inner) {
  const style = getComputedStyle(inner)
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
  const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 0
  const kids = [...inner.children]
  let contentW = 0
  let contentH = 0
  kids.forEach((child, index) => {
    contentW = Math.max(contentW, child.scrollWidth)
    contentH += child.offsetHeight
    if (index > 0) contentH += gap
  })
  return { w: Math.ceil(contentW + padX) + 4, h: Math.ceil(contentH + padY) + 2 }
}

function fitFace(outer, inner, setStretch) {
  const natural = faceSize(inner)
  const boxW = outer.clientWidth
  const boxH = outer.clientHeight
  if (!natural.w || !natural.h || !boxW || !boxH) return
  const x = boxW / natural.w
  const y = boxH / natural.h
  setStretch((prev) =>
    Math.abs(prev.x - x) < 0.01 && Math.abs(prev.y - y) < 0.01 ? prev : { x, y }
  )
}

function ClockWidget({ clearClass, now }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [stretch, setStretch] = useState({ x: 1, y: 1 })
  const hour = now.getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const fit = () => fitFace(outer, inner, setStretch)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [greeting, dateLabel])

  return (
    <div ref={outerRef} className={`${clearClass} clock`}>
      <div
        ref={innerRef}
        className="clock-face"
        style={{ transform: `scale(${stretch.x}, ${stretch.y})`, transformOrigin: 'top left' }}
      >
        <div className="greeting">Good {greeting}</div>
        <div className="time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="date-line">{dateLabel}</div>
      </div>
    </div>
  )
}

function QuoteWidget({ clearClass, props }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [stretch, setStretch] = useState({ x: 1, y: 1 })
  const quote = props.body || props.quote || ''
  const byline = [props.author || props.title || '', props.role || ''].filter(Boolean).join(' · ')

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const fit = () => fitFace(outer, inner, setStretch)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [quote, byline])

  return (
    <div ref={outerRef} className={`${clearClass} quote`}>
      <div
        ref={innerRef}
        className="quote-face"
        style={{ transform: `scale(${stretch.x}, ${stretch.y})`, transformOrigin: 'top left' }}
      >
        <p>{quote}</p>
        {byline ? <cite>— {byline}</cite> : null}
      </div>
    </div>
  )
}

function Widget({ widget, pageBackground = '#ffffff', now }) {
  const { type, props = {} } = widget
  const pageLight = isLightBackground(pageBackground)
  const accentClass = pageLight ? 'widget accent light-page' : 'widget accent dark-page'
  const contentClass = pageLight ? 'widget content light-page' : 'widget content dark-page'
  const clearClass = pageLight ? 'widget clear light-page' : 'widget clear dark-page'

  if (type === 'clock') {
    return <ClockWidget clearClass={clearClass} now={now} />
  }

  if (type === 'weather') {
    return <WeatherWidget props={props} className={accentClass} />
  }

  if (type === 'calendar') {
    const items = Array.isArray(props.items) ? props.items : []
    return (
      <div className={`${contentClass} calendar`}>
        <h3>{props.title || "Today's Schedule"}</h3>
        <ul>
          {items.map((item, i) => (
            <li key={`${item.time}-${i}`} style={item.color ? { borderLeft: `3px solid ${item.color}`, paddingLeft: 8 } : undefined}>
              <strong style={item.color ? { color: item.color } : undefined}>{item.time}</strong>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'dashboard') {
    const metrics = Array.isArray(props.metrics) ? props.metrics : []
    return (
      <div className={`${accentClass} kpi`}>
        <strong className="kpi-title">{props.title || 'Company KPIs'}</strong>
        <div className="metrics">
          {metrics.map((m, i) => (
            <div key={m.label} className="metric">
              {i > 0 ? <span className="metric-rule" aria-hidden /> : null}
              <span>{m.label}</span>
              <b>{m.value}</b>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'web' && props.url) {
    const direct = shouldEmbedDirect(props.url)
    return (
      <div className="widget frame-shell">
        <iframe
          title={props.title || 'Web'}
          src={resolveWebEmbedUrl(props.url)}
          className="widget frame"
          referrerPolicy={direct ? 'strict-origin-when-cross-origin' : 'no-referrer'}
          allow="fullscreen; clipboard-read; clipboard-write; encrypted-media"
          allowFullScreen
        />
      </div>
    )
  }

  if (type === 'web') {
    return (
      <div className={contentClass}>
        <h3>Web</h3>
        <p>Add a website URL</p>
      </div>
    )
  }

  if (type === 'image' && (props.src || props.url)) {
    return (
      <div className="widget media clear">
        <img
          src={resolveMediaUrl(props.src || props.url)}
          alt={props.title || 'Image'}
          style={{ objectFit: props.fit || 'cover' }}
        />
      </div>
    )
  }

  if (type === 'video' && (props.src || props.url)) {
    const loop = props.loop !== false && props.playback !== 'once'
    return (
      <VideoPlayer
        src={resolveVideoUrl(props.src || props.url)}
        loop={loop}
        fit={props.fit || 'cover'}
        title={props.title || 'Video'}
      />
    )
  }

  if (type === 'pdf' && (props.src || props.url)) {
    return <PdfViewer rawUrl={props.src || props.url} title={props.title || 'PDF'} />
  }

  if (type === 'image' || type === 'video' || type === 'pdf') {
    return (
      <div className={contentClass}>
        <h3>{props.title || type}</h3>
        <p>Select media in the editor</p>
      </div>
    )
  }

  if (type === 'heading') {
    const fontSize = Number(props.fontSize) || 32
    const bold = props.bold !== false
    const align = props.align === 'center' || props.align === 'right' ? props.align : 'left'
    return (
      <div className={`${clearClass} heading-widget`} style={{ textAlign: align }}>
        <h2
          style={{
            fontSize,
            fontWeight: bold ? 800 : 500,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {props.text || props.title || ''}
        </h2>
      </div>
    )
  }

  if (type === 'text') {
    const body = props.body || props.text || ''
    const legacyTitle = !body && props.title ? props.title : ''
    const fontSize = Number(props.fontSize) || 16
    const bold = Boolean(props.bold)
    const align = props.align === 'center' || props.align === 'right' ? props.align : 'left'
    return (
      <div className={`${clearClass} text-widget`} style={{ textAlign: align }}>
        {legacyTitle ? <h3>{legacyTitle}</h3> : null}
        <p
          style={{
            fontSize,
            fontWeight: bold ? 700 : 400,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {body}
        </p>
      </div>
    )
  }

  if (type === 'notes') {
    const items = Array.isArray(props.items)
      ? props.items
      : props.body
        ? [{ text: props.body }]
        : []
    return (
      <div className="widget notes">
        <div className="notes-title">{props.title || 'Notes'}</div>
        <ul>
          {items.map((item, i) => (
            <li key={i}>{typeof item === 'string' ? item : item.text || item.label}</li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'news') {
    const items = Array.isArray(props.items)
      ? props.items
      : props.body
        ? [{ headline: props.body }]
        : []
    return (
      <div className={`${accentClass} news`}>
        <div className="news-head">
          <strong>{props.title || 'Headlines'}</strong>
          <span>NEWS</span>
        </div>
        <ul>
          {items.map((item, i) => (
            <li key={i}>
              <div className="news-line">{item.headline || item.label || item.text}</div>
              {item.source ? <div className="muted small">{item.source}</div> : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'quotes') {
    return <QuoteWidget clearClass={clearClass} props={props} />
  }

  return (
    <div className={contentClass}>
      <h3>{props.title || type}</h3>
      <p>{props.body || ''}</p>
    </div>
  )
}

export default function Player() {
  const { publicKey } = useParams()
  const [display, setDisplay] = useState(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [error, setError] = useState('')
  const [source, setSource] = useState('loading')
  const [lastSync, setLastSync] = useState(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  /** When true, the slideshow stays on the current page until the user resumes. */
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(() =>
    typeof document !== 'undefined' ? isFullscreen() : false
  )
  const [chromeVisible, setChromeVisible] = useState(true)
  const stageRef = useRef(null)
  const chromeTimerRef = useRef(null)

  const failuresRef = useRef(0)
  const revisionRef = useRef('')
  const minuteNow = useMinuteTick()
  const scale = useStageScale(display?.orientation || 'Landscape')

  // A visible clock needs a per-second repaint; otherwise once a minute is plenty.
  const hasClock = useMemo(
    () =>
      (display?.pages || []).some((page) =>
        (page.widgets || []).some((w) => w.type === 'clock')
      ),
    [display]
  )
  useSecondTick(hasClock)

  // Boot straight from cache so a reboot without network still plays.
  useEffect(() => {
    const cached = readCache(publicKey)
    if (cached) {
      setDisplay(cached.display)
      setSource('cache')
      setLastSync(cached.cachedAt)
    }
    writePairedKey(publicKey)
  }, [publicKey])

  useEffect(() => {
    if (display?.name) document.title = `${display.name} | Profile Solution`
    else document.title = 'Profile Solution Player'
  }, [display?.name])

  useEffect(() => {
    function goOnline() {
      setOffline(false)
    }
    function goOffline() {
      setOffline(true)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    function syncFs() {
      setFullscreen(isFullscreen())
    }
    document.addEventListener('fullscreenchange', syncFs)
    document.addEventListener('webkitfullscreenchange', syncFs)
    return () => {
      document.removeEventListener('fullscreenchange', syncFs)
      document.removeEventListener('webkitfullscreenchange', syncFs)
    }
  }, [])

  const revealChrome = useCallback(() => {
    setChromeVisible(true)
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    chromeTimerRef.current = setTimeout(() => {
      if (isFullscreen() && !paused) setChromeVisible(false)
    }, 3500)
  }, [paused])

  useEffect(() => {
    if (!fullscreen) {
      setChromeVisible(true)
      return undefined
    }
    revealChrome()
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    }
  }, [fullscreen, revealChrome])

  useEffect(() => {
    if (paused) setChromeVisible(true)
  }, [paused])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/displays/public/${publicKey}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to load display')

      failuresRef.current = 0
      setError('')
      setSource('live')
      setLastSync(new Date().toISOString())

      // Only swap state when the layout actually changed — never on heartbeat.
      const revision = contentRevision(data.display)
      if (revision !== revisionRef.current) {
        const prev = revisionRef.current
        revisionRef.current = revision
        setDisplay(data.display)
        // Restart from page 1 only when pages were added/removed/reordered,
        // not when widget props alone changed mid-playback.
        const prevPages = prev ? (() => { try { return JSON.parse(prev).pages?.map((p) => p.id) } catch { return null } })() : null
        const nextPages = (data.display.pages || []).map((p) => p.id)
        const pagesChanged =
          !prevPages ||
          prevPages.length !== nextPages.length ||
          prevPages.some((id, i) => id !== nextPages[i])
        if (pagesChanged) setPageIndex(0)
      }
      writeCache(publicKey, data.display)

      return data.pollAfterMs || BASE_POLL_MS
    } catch (err) {
      failuresRef.current += 1
      // Keep showing cached content; only surface an error with nothing to play.
      setSource((prev) => (prev === 'live' ? 'stale' : prev === 'loading' ? 'error' : prev))
      if (!readCache(publicKey) && !display) setError(err.message)

      // Exponential backoff so a downed API is not hammered by a wall of screens.
      return Math.min(BASE_POLL_MS * 2 ** Math.min(failuresRef.current, 3), MAX_POLL_MS)
    }
    // `display` is intentionally excluded: it would restart polling on every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey])

  useEffect(() => {
    let timer
    let alive = true

    async function tick() {
      const delay = await load()
      if (alive) timer = setTimeout(tick, delay)
    }
    tick()

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [load])

  // Pages currently allowed to play by their own schedule.
  const playable = useMemo(() => {
    const pages = display?.pages || []
    const eligible = pages.filter((page) => isScheduleActive(page.schedule, minuteNow))
    return eligible.length ? eligible : []
  }, [display, minuteNow])

  const displayActive = isScheduleActive(display?.schedule, minuteNow)
  const safeIndex = playable.length ? pageIndex % playable.length : 0
  const page = playable[safeIndex]

  // Advance pages on their configured duration (unless the user paused the slide).
  useEffect(() => {
    if (paused || !displayActive || playable.length < 2) return undefined
    const duration = Math.max(1, playable[safeIndex]?.durationSec || 10) * 1000
    const timer = setTimeout(() => setPageIndex((i) => i + 1), duration)
    return () => clearTimeout(timer)
  }, [paused, displayActive, playable, safeIndex])

  // Space / Enter toggles pause; F toggles fullscreen; arrows change page.
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = playable.length
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen(stageRef.current || document.documentElement)
        return
      }
      if (e.key === 'Escape' && isFullscreen()) {
        // Let the browser exit fullscreen; keep chrome visible afterward.
        setChromeVisible(true)
        return
      }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (n > 1 && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault()
        setPageIndex((i) => {
          const cur = i % n
          return (cur + 1) % n
        })
        setPaused(true)
      } else if (n > 1 && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault()
        setPageIndex((i) => {
          const cur = i % n
          return (cur - 1 + n) % n
        })
        setPaused(true)
      }
      revealChrome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playable.length, revealChrome])

  if (error && !display) return <div className="boot error">{error}</div>
  if (!display) return <div className="boot">Loading display...</div>

  if (display.playbackStopped) {
    return (
      <div className="stage idle" style={{ backgroundColor: '#000' }}>
        <div className="idle-card">
          <strong>{display.name}</strong>
          <span>Display stopped remotely</span>
          <span className="idle-hint">Resume from the Profile Solution dashboard</span>
        </div>
      </div>
    )
  }

  if (!displayActive) {
    return (
      <div className="stage idle" style={{ backgroundColor: '#000' }}>
        <div className="idle-card">
          <strong>{display.name}</strong>
          <span>Outside its scheduled hours</span>
        </div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="stage idle" style={{ backgroundColor: '#000' }}>
        <div className="idle-card">
          <strong>{display.name}</strong>
          <span>No pages scheduled right now</span>
        </div>
      </div>
    )
  }

  const bg = page.backgroundColor || '#ffffff'
  const degraded = offline || source === 'stale' || source === 'cache'
  const multiPage = playable.length > 1

  function goToPage(index) {
    const n = playable.length
    if (!n) return
    const next = ((index % n) + n) % n
    setPageIndex(next)
    setPaused(true)
    revealChrome()
  }

  async function goFullscreen(e) {
    e?.stopPropagation?.()
    await enterFullscreen(stageRef.current || document.documentElement)
    revealChrome()
  }

  function togglePause(e) {
    // Ignore clicks that originated inside interactive embeds — those need normal use.
    // A dedicated pause control and page dots still work.
    if (e?.target?.closest?.('iframe, video, a, button, input, textarea, select')) return
    revealChrome()
    setPaused((p) => !p)
  }

  const showChrome = chromeVisible || paused || !fullscreen

  return (
    <div
      ref={stageRef}
      className={`stage${paused ? ' is-paused' : ''}${fullscreen ? ' is-fullscreen' : ''}${showChrome ? '' : ' chrome-hidden'}`}
      onClick={togglePause}
      onPointerMove={revealChrome}
      role="presentation"
    >
      <div
        className="canvas"
        key={page.id || safeIndex}
        style={{
          width: scale.width,
          height: scale.height,
          transform: `translate(${scale.offsetX}px, ${scale.offsetY}px) scale(${scale.factor})`,
          transformOrigin: 'top left',
          backgroundColor: bg,
        }}
      >
        {page.backgroundImage ? (
          <img
            src={resolveMediaUrl(page.backgroundImage)}
            alt=""
            className="page-bg-image"
            style={{
              objectFit: page.backgroundFit || 'cover',
              filter: `brightness(${(Number(page.backgroundBrightness) || 100) / 100})`,
            }}
          />
        ) : null}
        {(page.widgets || []).map((w, layerIndex) => {
          const opacity = Number(w.props?.opacity)
          const cornerRadius = Number(w.props?.cornerRadius)
          const shadowOff = w.props?.shadow === false
          return (
            <div
              key={w.id}
              className={`abs${
                w.type === 'clock' ||
                w.type === 'quotes' ||
                w.type === 'image' ||
                w.type === 'heading' ||
                w.type === 'text'
                  ? ' bare'
                  : ''
              }`}
              style={{
                left: w.x,
                top: w.y,
                width: w.w,
                height: w.h,
                zIndex: 10 + layerIndex,
                opacity: Number.isFinite(opacity) ? opacity : 1,
                borderRadius: Number.isFinite(cornerRadius) ? cornerRadius : undefined,
                boxShadow: shadowOff ? 'none' : undefined,
                overflow: 'hidden',
                transform: w.props?.flipH ? 'scaleX(-1)' : undefined,
                filter: w.props?.blur ? `blur(${Number(w.props.blur) || 0}px)` : undefined,
              }}
            >
              <Widget widget={w} pageBackground={bg} now={minuteNow} />
            </div>
          )
        })}
        <VisualOverlay overlay={page.overlay} />
      </div>

      {multiPage ? (
        <div className="page-dots chrome" onClick={(e) => e.stopPropagation()}>
          {playable.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={i === safeIndex ? 'dot on' : 'dot'}
              title={p.name || `Page ${i + 1}`}
              aria-label={`${p.name || `Page ${i + 1}`}${i === safeIndex ? ' (current)' : ''}`}
              onClick={() => goToPage(i)}
            />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className={`pause-badge chrome${paused ? ' visible' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setPaused((p) => !p)
          revealChrome()
        }}
        title={paused ? 'Resume slideshow' : 'Pause slideshow'}
        aria-pressed={paused}
      >
        {paused ? (
          <>
            <span className="pause-icon">▶</span>
            Paused · tap to play
            {multiPage ? <span className="pause-page">{safeIndex + 1}/{playable.length}</span> : null}
          </>
        ) : (
          <>
            <span className="pause-icon">❚❚</span>
            {multiPage ? `${safeIndex + 1}/${playable.length}` : 'Playing'}
          </>
        )}
      </button>

      <div className="corner-actions chrome" onClick={(e) => e.stopPropagation()}>
        {degraded ? (
          <div className="conn-badge" title={lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : ''}>
            <span className="conn-dot" />
            {offline ? 'Offline' : 'Showing saved copy'}
          </div>
        ) : null}
        <button
          type="button"
          className="fs-icon-btn"
          onClick={(e) => {
            e.stopPropagation()
            if (fullscreen) exitFullscreen()
            else goFullscreen(e)
          }}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F)'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={fullscreen}
        >
          {fullscreen ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm10 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M7 14H5v5h5v-2H7v-3zm12 5h-5v-2h3v-3h2v5zM7 5v3h2V7h3V5H7zm10 3V5h-5v2h3v3h2z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
