import { useLayoutEffect, useRef, useState } from 'react'
import { resolveWebEmbedUrl } from '../lib/api'
import PdfViewer from './PdfViewer'

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

export function isLightBackground(color) {
  const rgb = parseHex(color)
  if (!rgb) return true
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 155
}

const shellBase =
  'relative h-full w-full overflow-hidden rounded-[14px] border shadow-[0_12px_32px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.06)]'

function darkShell(extra = '') {
  return `${shellBase} border-white/15 bg-gradient-to-br from-[#121826] to-[#1a2332] text-white ${extra}`
}

function lightShell(extra = '') {
  return `${shellBase} border-black/10 bg-gradient-to-b from-white to-[#f7f9fc] text-gray-900 ${extra}`
}

function mediaSrc(props, { preferDirect = false } = {}) {
  const raw = props.src || props.url || ''
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw
  const api = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  const origin = api.replace(/\/api\/?$/, '')

  try {
    const parsed = raw.startsWith('/') ? new URL(raw, origin) : new URL(raw)
    if (parsed.pathname.startsWith('/uploads/')) {
      return `${origin}${parsed.pathname}${parsed.search}`
    }
  } catch {
    // fall through
  }

  if (raw.startsWith('/uploads/')) return `${origin}${raw}`
  if (/^https?:\/\//i.test(raw)) {
    if (raw.startsWith(origin) || raw.includes('/api/media/proxy')) return raw
    if (preferDirect) return raw
    return `${api}/media/proxy?url=${encodeURIComponent(raw)}`
  }
  return raw
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
  // Extra pixels so the last glyph and letter-spacing are not clipped.
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

function ClockPreview({ pageLight }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [stretch, setStretch] = useState({ x: 1, y: 1 })
  const now = new Date()
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
    <div ref={outerRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={innerRef}
        className={`flex w-max flex-col items-start ${pageLight ? 'text-gray-900' : 'text-white'}`}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          boxSizing: 'border-box',
          gap: 4,
          padding: 8,
          transform: `scale(${stretch.x}, ${stretch.y})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          className={`font-semibold uppercase ${pageLight ? 'text-gray-500' : 'text-white/55'}`}
          style={{ fontSize: 13, letterSpacing: '0.08em', lineHeight: 1.1, whiteSpace: 'nowrap' }}
        >
          Good {greeting}
        </div>
        <div
          className="font-extrabold leading-none tracking-tight text-brand tabular-nums"
          style={{ fontSize: 52, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}
        >
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          className={`font-medium ${pageLight ? 'text-gray-400' : 'text-white/55'}`}
          style={{ fontSize: 15, lineHeight: 1.15, whiteSpace: 'nowrap' }}
        >
          {dateLabel}
        </div>
      </div>
    </div>
  )
}

function QuotePreview({ pageLight, body, author, role }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [stretch, setStretch] = useState({ x: 1, y: 1 })
  const quote = body || 'Your inspiring quote goes here'
  const byline = [author, role].filter(Boolean).join(' · ')

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
    <div ref={outerRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={innerRef}
        className={`flex w-max flex-col items-center text-center ${pageLight ? 'text-gray-900' : 'text-white'}`}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          boxSizing: 'border-box',
          gap: byline ? 6 : 0,
          padding: 4,
          transform: `scale(${stretch.x}, ${stretch.y})`,
          transformOrigin: 'top left',
        }}
      >
        <p
          className="m-0 font-display font-medium"
          style={{
            fontSize: 22,
            lineHeight: 1.35,
            letterSpacing: '-0.015em',
            whiteSpace: 'pre',
          }}
        >
          {quote}
        </p>
        {byline ? (
          <div
            className={`font-semibold uppercase ${pageLight ? 'text-gray-500' : 'text-white/50'}`}
            style={{ fontSize: 11, letterSpacing: '0.12em', lineHeight: 1.2, whiteSpace: 'nowrap' }}
          >
            — {byline}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function WidgetPreview({ widget, pageBackground = '#ffffff' }) {
  const { type, props = {} } = widget
  const pageLight = isLightBackground(pageBackground)

  const accentShell = pageLight
    ? `${shellBase} border-brand/20 bg-[radial-gradient(120%_80%_at_100%_0%,rgba(139,197,63,0.14),transparent_45%),linear-gradient(155deg,#0f172a_0%,#162032_48%,#1a2332_100%)] text-white before:absolute before:left-0 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-brand before:to-[#6aad2e]`
    : `${shellBase} border-white/15 bg-[radial-gradient(120%_80%_at_100%_0%,rgba(139,197,63,0.12),transparent_45%),linear-gradient(155deg,#121826_0%,#1a2332_100%)] text-white before:absolute before:left-0 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-brand before:to-[#6aad2e]`
  const contentShell = pageLight ? lightShell() : darkShell()
  const clearShell = pageLight
    ? 'h-full w-full overflow-hidden bg-transparent text-gray-900'
    : 'h-full w-full overflow-hidden bg-transparent text-white'

  if (type === 'clock') {
    return <ClockPreview pageLight={pageLight} />
  }

  if (type === 'weather') {
    return (
      <div className={`flex items-center gap-3 p-4 ${accentShell}`}>
        <span className="text-3xl">☀️</span>
        <div>
          <div className="text-3xl font-bold">{props.temp ?? 28}°C</div>
          <div className={`text-sm ${pageLight ? 'text-white/60' : 'text-white/75'}`}>
            {props.condition || 'Partly Cloudy'}
          </div>
        </div>
      </div>
    )
  }

  if (type === 'calendar') {
    return (
      <div className={`overflow-auto p-4 ${contentShell}`}>
        <div className={`mb-2 text-[15px] font-bold tracking-wide ${pageLight ? 'text-gray-900' : 'text-white'}`}>
          {props.title || "Today's Schedule"}
        </div>
        <ul className={`divide-y text-sm ${pageLight ? 'divide-black/5 text-gray-700' : 'divide-white/10 text-white/85'}`}>
          {(props.items || [{ time: '10:00', label: 'Meeting' }]).map((item, i) => (
            <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: item.color || '#7c3aed' }}
              />
              <span className="min-w-[3.2em] font-bold tabular-nums" style={{ color: item.color || undefined }}>
                {item.time}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'dashboard') {
    return (
      <div className={`flex items-center justify-between gap-4 px-5 py-4 pl-6 ${accentShell}`}>
        <div className="shrink-0 text-[15px] font-bold uppercase tracking-[0.04em] text-brand">
          {props.title || 'Company KPIs'}
        </div>
        <div className="flex">
          {(props.metrics || []).map((m, i) => (
            <div
              key={m.label}
              className={`min-w-[72px] px-4 ${i > 0 ? 'border-l border-white/15' : ''}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{m.label}</div>
              <div className="mt-0.5 text-[22px] font-extrabold tabular-nums tracking-tight">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'heading') {
    const label = props.text || props.title || 'Heading'
    const fontSize = Number(props.fontSize) || 32
    const bold = props.bold !== false
    const align = props.align === 'center' || props.align === 'right' ? props.align : 'left'
    return (
      <div className={`h-full w-full overflow-hidden p-1 ${clearShell}`} style={{ textAlign: align }}>
        <div
          className={`leading-[1.15] tracking-tight ${pageLight ? 'text-gray-900' : 'text-white'}`}
          style={{
            fontSize,
            fontWeight: bold ? 800 : 500,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {label}
        </div>
      </div>
    )
  }

  if (type === 'text') {
    const fontSize = Number(props.fontSize) || 16
    const bold = Boolean(props.bold)
    const align = props.align === 'center' || props.align === 'right' ? props.align : 'left'
    return (
      <div className={`h-full w-full overflow-hidden p-1 ${clearShell}`} style={{ textAlign: align }}>
        <p
          className={`m-0 leading-[1.2] ${pageLight ? 'text-gray-700' : 'text-white/80'}`}
          style={{
            fontSize,
            fontWeight: bold ? 700 : 400,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {props.body || props.text || 'Add your message here'}
        </p>
      </div>
    )
  }

  if (type === 'notes') {
    const items = props.items?.length
      ? props.items
      : [{ text: props.body || 'Add a note' }]
    return (
      <div
        className={`${shellBase} flex flex-col overflow-auto border-amber-300/60 bg-[#fff8e7] p-3 text-gray-900 shadow-[0_6px_22px_rgba(180,120,20,0.18)]`}
      >
        <div className="mb-2 flex items-center gap-2 border-b border-amber-200/80 pb-2 text-sm font-bold text-amber-900">
          <span className="grid h-5 w-5 place-items-center rounded bg-amber-400/40 text-[10px]">✓</span>
          {props.title || 'Notes'}
        </div>
        <ul className="space-y-1.5 text-sm text-amber-950/80">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{typeof item === 'string' ? item : item.text || item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'news') {
    const items = props.items?.length
      ? props.items
      : [{ headline: props.body || 'Latest update', source: 'Internal' }]
    return (
      <div className={`overflow-auto p-4 pl-5 ${accentShell}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            {props.title || 'Headlines'}
          </div>
          <span className="rounded-full border border-brand/30 bg-brand/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white/70">
            NEWS
          </span>
        </div>
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="border-l-2 border-brand/90 pl-3">
              <div className="text-[15px] font-semibold leading-snug tracking-tight text-white">
                {item.headline || item.label || item.text}
              </div>
              {item.source ? (
                <div className="mt-0.5 text-[11px] text-white/45">{item.source}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (type === 'quotes') {
    return (
      <QuotePreview
        pageLight={pageLight}
        body={props.body || props.quote || ''}
        author={props.author || props.title || ''}
        role={props.role || ''}
      />
    )
  }

  if (type === 'web') {
    if (props.url) {
      const embedSrc = resolveWebEmbedUrl(props.url)
      const direct = /powerbi\.com|fabric\.microsoft\.com/i.test(props.url)
      return (
        <div className={`${shellBase} relative border-black/10 bg-white`}>
          <iframe
            title={props.title || 'Web'}
            src={embedSrc}
            className="h-full w-full border-0 bg-white"
            referrerPolicy={direct ? 'strict-origin-when-cross-origin' : 'no-referrer'}
            allow="fullscreen; clipboard-read; clipboard-write; encrypted-media"
            allowFullScreen
          />
        </div>
      )
    }
    return (
      <div className={`grid place-items-center p-3 text-center text-sm ${accentShell}`}>
        Web
        <div className="mt-1 text-xs opacity-70">Add a website URL in Properties</div>
      </div>
    )
  }

  if (type === 'image') {
    const src = mediaSrc(props)
    if (src) {
      return (
        <div className="h-full w-full overflow-hidden bg-transparent">
          <img
            src={src}
            alt={props.title || 'Image'}
            className="h-full w-full"
            style={{ objectFit: props.fit || 'cover' }}
          />
        </div>
      )
    }
    return (
      <div className={`grid place-items-center text-sm font-semibold ${accentShell}`}>
        Image
        <span className="mt-1 px-3 text-center text-xs opacity-70">Select media in Properties</span>
      </div>
    )
  }

  if (type === 'video') {
    const src = mediaSrc(props, { preferDirect: true })
    const loop = props.loop !== false && props.playback !== 'once'
    if (src) {
      return (
        <div className={`${shellBase} border-black/10 bg-black`}>
          <video
            key={`${src}|${loop ? 'loop' : 'once'}`}
            src={src}
            className="h-full w-full"
            style={{ objectFit: props.fit || 'cover' }}
            muted
            playsInline
            autoPlay
            loop={loop}
            preload="auto"
          />
        </div>
      )
    }
    return (
      <div className={`grid place-items-center text-sm font-semibold ${accentShell}`}>
        Video
        <span className="mt-1 px-3 text-center text-xs opacity-70">Select media in Properties</span>
      </div>
    )
  }

  if (type === 'pdf') {
    return (
      <PdfViewer
        rawUrl={props.src || props.url || ''}
        title={props.title || 'PDF'}
        shellClass={`${shellBase} border-black/10 bg-[#111827] text-white`}
      />
    )
  }

  return (
    <div className={`grid place-items-center text-sm font-semibold capitalize ${contentShell}`}>
      {type}
    </div>
  )
}
