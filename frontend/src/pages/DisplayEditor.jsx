import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { displaysApi, mediaApi, resolveMediaUrl, canonicalMediaRef, calendarApi } from '../lib/api'
import { describeSchedule, serializeSchedule } from '../lib/schedule'
import BackButton from '../components/BackButton'
import ScheduleEditor from '../components/ScheduleEditor'
import WidgetPreview from '../components/WidgetPreview'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ImageIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '../components/Icons'
import VisualOverlay from '../components/VisualOverlay'
import OverlayPanel, { OverlayIconGrid, OverlaySettingsForm } from '../components/OverlayPanel'
import ConfirmDialog from '../components/ConfirmDialog'
import { normalizeOverlay } from '../lib/pageVisuals'
import logo from '../assets/Logo.png'

const WIDGET_TYPES = [
  'clock',
  'weather',
  'calendar',
  'image',
  'video',
  'heading',
  'text',
  'pdf',
  'web',
  'dashboard',
  'quotes',
  'news',
  'notes',
]

const CANVAS_W = 1280
const CANVAS_H = 720
const MIN_W = 24
const MIN_H = 24

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const CLOCK_PAD = 8
const CLOCK_GAP = 4
const CLOCK_GREETING = 13
const CLOCK_TIME = 52
const CLOCK_DATE = 15

function isCopyWidget(type) {
  return type === 'heading' || type === 'text'
}

function isHugWidget(type) {
  return isCopyWidget(type)
}

function clockCopy(now = new Date()) {
  const hour = now.getHours()
  return {
    greeting: `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`,
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }),
  }
}

function measureLine(text, css) {
  const el = document.createElement('div')
  el.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;font-family:Outfit,system-ui,sans-serif;${css}`
  el.textContent = text
  document.body.appendChild(el)
  const rect = el.getBoundingClientRect()
  document.body.removeChild(el)
  return rect
}

/** Clock frame is the text block only — greeting, time, and date, with no empty area. */
function measureClockSize(scale = 1) {
  if (typeof document === 'undefined') return null
  const s = scale > 0 ? scale : 1
  const { greeting, time, date } = clockCopy()
  const greetingBox = measureLine(
    greeting,
    `font-size:${CLOCK_GREETING * s}px;font-weight:650;letter-spacing:0.08em;line-height:1.1;text-transform:uppercase`
  )
  const timeBox = measureLine(
    time,
    `font-size:${CLOCK_TIME * s}px;font-weight:800;letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums`
  )
  const dateBox = measureLine(
    date,
    `font-size:${CLOCK_DATE * s}px;font-weight:500;line-height:1.15`
  )
  const pad = CLOCK_PAD * s
  const gap = CLOCK_GAP * s
  const w = Math.ceil(Math.max(greetingBox.width, timeBox.width, dateBox.width) + pad * 2)
  const h = Math.ceil(greetingBox.height + timeBox.height + dateBox.height + gap * 2 + pad * 2)
  return {
    w: clamp(w, 24, CANVAS_W),
    h: clamp(h, 24, CANVAS_H),
  }
}

function copyWidgetMinSize(type) {
  return { minW: 16, minH: type === 'heading' ? 16 : 16 }
}

/** Measure heading/text so the frame hugs the content (no empty padding box). */
function measureCopyWidgetSize(widget) {
  if (typeof document === 'undefined' || !isCopyWidget(widget?.type)) return null
  const fontSize =
    Number(widget.props?.fontSize) || (widget.type === 'heading' ? 32 : 16)
  const bold =
    widget.type === 'heading' ? widget.props?.bold !== false : Boolean(widget.props?.bold)
  const raw =
    widget.type === 'heading'
      ? widget.props?.text || widget.props?.title || ''
      : widget.props?.body || widget.props?.text || ''
  const text = String(raw || ' ').replace(/\r\n/g, '\n')
  const padX = 4
  const padY = 4
  const maxContentW = Math.max(48, CANVAS_W - (widget.x || 0) - padX * 2)

  const el = document.createElement('div')
  el.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    `max-width:${maxContentW}px`,
    'width:max-content',
    `font-size:${fontSize}px`,
    `font-weight:${bold ? (widget.type === 'heading' ? 800 : 700) : widget.type === 'heading' ? 500 : 400}`,
    'font-family:Outfit,system-ui,sans-serif',
    'white-space:pre-wrap',
    'word-break:break-word',
    `line-height:${widget.type === 'heading' ? 1.15 : 1.2}`,
    `letter-spacing:${widget.type === 'heading' ? '-0.025em' : '0'}`,
  ].join(';')
  el.textContent = text
  document.body.appendChild(el)
  const rect = el.getBoundingClientRect()
  document.body.removeChild(el)

  const { minW, minH } = copyWidgetMinSize(widget.type)
  const w = clamp(Math.ceil(rect.width) + padX * 2 + 2, minW, CANVAS_W - (widget.x || 0))
  const h = clamp(Math.ceil(rect.height) + padY * 2 + 2, minH, CANVAS_H - (widget.y || 0))
  return { w, h }
}

function measureBlock(text, css) {
  const el = document.createElement('div')
  el.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;${css}`
  el.textContent = text
  document.body.appendChild(el)
  const rect = el.getBoundingClientRect()
  document.body.removeChild(el)
  return rect
}

/** Quote frame is the quote and author only. */
function measureQuoteSize(widget) {
  if (typeof document === 'undefined' || widget?.type !== 'quotes') return null
  const scale = Number(widget.props?.scale) > 0 ? Number(widget.props.scale) : 1
  const body = String(widget.props?.body || widget.props?.quote || 'Your inspiring quote goes here')
  const authorName = widget.props?.author || widget.props?.title || ''
  const role = widget.props?.role || ''
  const author = [authorName, role].filter(Boolean).join(' · ')
  const pad = 4 * scale
  const gap = author ? 6 * scale : 0
  const maxContentW = Math.max(80, CANVAS_W - (widget.x || 0) - pad * 2)
  const bodyBox = measureBlock(body, [
    `max-width:${maxContentW}px`,
    'width:max-content',
    `font-size:${22 * scale}px`,
    'font-weight:500',
    "font-family:Fraunces,Georgia,'Times New Roman',serif",
    'line-height:1.35',
    'letter-spacing:-0.015em',
    'text-align:center',
    'white-space:pre-wrap',
  ].join(';'))
  const authorBox = author
    ? measureBlock(`— ${author}`, [
        'white-space:nowrap',
        `font-size:${11 * scale}px`,
        'font-weight:650',
        'font-family:Outfit,system-ui,sans-serif',
        'letter-spacing:0.12em',
        'line-height:1.2',
        'text-transform:uppercase',
      ].join(';'))
    : { width: 0, height: 0 }
  const w = clamp(Math.ceil(Math.max(bodyBox.width, authorBox.width) + pad * 2) + 2, 24, CANVAS_W - (widget.x || 0))
  const h = clamp(Math.ceil(bodyBox.height + authorBox.height + gap + pad * 2) + 2, 24, CANVAS_H - (widget.y || 0))
  return { w, h }
}

function withFittedCopySize(widget) {
  const size = measureCopyWidgetSize(widget)
  return size ? { ...widget, ...size } : widget
}

function hugWidget(widget) {
  if (!widget) return widget
  if (isCopyWidget(widget.type)) return withFittedCopySize(widget)
  return widget
}

function hugDisplay(display) {
  if (!display?.pages) return display
  return {
    ...display,
    pages: display.pages.map((page) => ({
      ...page,
      widgets: (page.widgets || []).map(hugWidget),
    })),
  }
}

function placeHug(handle, drag, size) {
  let x = drag.origX
  let y = drag.origY
  if (handle.includes('w')) x = drag.origX + drag.origW - size.w
  if (handle.includes('n')) y = drag.origY + drag.origH - size.h
  x = clamp(Math.round(x), 0, Math.max(0, CANVAS_W - size.w))
  y = clamp(Math.round(y), 0, Math.max(0, CANVAS_H - size.h))
  return { x, y, w: size.w, h: size.h }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const RESIZE_HANDLES = [
  { key: 'nw', cursor: 'nwse-resize', style: { left: 0, top: 0 } },
  { key: 'n', cursor: 'ns-resize', style: { left: '50%', top: 0, marginLeft: -5 } },
  { key: 'ne', cursor: 'nesw-resize', style: { right: 0, top: 0 } },
  { key: 'e', cursor: 'ew-resize', style: { right: 0, top: '50%', marginTop: -5 } },
  { key: 'se', cursor: 'nwse-resize', style: { right: 0, bottom: 0 } },
  { key: 's', cursor: 'ns-resize', style: { left: '50%', bottom: 0, marginLeft: -5 } },
  { key: 'sw', cursor: 'nesw-resize', style: { left: 0, bottom: 0 } },
  { key: 'w', cursor: 'ew-resize', style: { left: 0, top: '50%', marginTop: -5 } },
]

const TIMER_PRESETS = [5, 10, 15, 20, 30, 60]

const BG_PRESETS = [
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'soft-gray', label: 'Soft gray', color: '#f3f4f6' },
  { id: 'soft-blue', label: 'Soft blue', color: '#e8f1ff' },
  { id: 'soft-green', label: 'Soft green', color: '#eef8e8' },
  { id: 'cream', label: 'Cream', color: '#fff8eb' },
  { id: 'brand', label: 'Brand', color: '#8bc53f' },
  { id: 'navy', label: 'Navy', color: '#0b1b33' },
  { id: 'black', label: 'Black', color: '#0f1115' },
]

export default function DisplayEditor() {
  const { id } = useParams()
  const [display, setDisplay] = useState(null)
  const displayRef = useRef(null)
  displayRef.current = display
  const [pageIndex, setPageIndex] = useState(0)
  const [dragPageFrom, setDragPageFrom] = useState(null)
  const [dragPageOver, setDragPageOver] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [playerUrl, setPlayerUrl] = useState('')
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pageToDelete, setPageToDelete] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [showTimerMenu, setShowTimerMenu] = useState(false)
  const [customTimer, setCustomTimer] = useState('10')
  const [library, setLibrary] = useState([])
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [mobileWidgetsOpen, setMobileWidgetsOpen] = useState(false)
  const [mobilePropsOpen, setMobilePropsOpen] = useState(false)
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [showLayersPanel, setShowLayersPanel] = useState(false)
  const [showOverlayPanel, setShowOverlayPanel] = useState(false)
  const [showPageSettings, setShowPageSettings] = useState(false)
  const [googleStatus, setGoogleStatus] = useState({
    oauth: false,
    connected: false,
    googleEmail: '',
  })

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const [stageScale, setStageScale] = useState(1)

  useEffect(() => {
    displaysApi
      .get(id)
      .then((data) => setDisplay(hugDisplay(data.display)))
      .catch((err) => setError(err.message))
    mediaApi
      .list()
      .then((data) => setLibrary(data.media || []))
      .catch(() => setLibrary([]))
    calendarApi
      .status()
      .then((data) => {
        setGoogleStatus({
          oauth: Boolean(data.googleOAuth),
          connected: Boolean(data.connected),
          googleEmail: data.googleEmail || '',
        })
      })
      .catch(() => {
        setGoogleStatus({ oauth: false, connected: false, googleEmail: '' })
      })
  }, [id])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined

    function updateScale() {
      const w = Math.max(el.clientWidth - 24, 160)
      const h = Math.max(el.clientHeight - 24, 160)
      const next = Math.min(1, w / CANVAS_W, h / CANVAS_H)
      setStageScale(Number.isFinite(next) && next > 0 ? next : 1)
    }

    updateScale()
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(updateScale)
    })
    ro.observe(el)
    window.addEventListener('resize', updateScale)
    window.addEventListener('orientationchange', updateScale)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateScale)
      window.removeEventListener('orientationchange', updateScale)
    }
  }, [display, mobileWidgetsOpen, mobilePropsOpen])

  useEffect(() => {
    if (selectedId) setMobilePropsOpen(true)
  }, [selectedId])

  async function connectGoogleFromEditor() {
    setCalendarBusy(true)
    setError('')
    try {
      // Clear a dead token first so Google issues a fresh refresh_token.
      if (googleStatus.connected) {
        try {
          await calendarApi.disconnectGoogle()
        } catch {
          // continue to connect anyway
        }
      }
      const data = await calendarApi.connectGoogle('editor')
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setCalendarBusy(false)
    }
  }

  async function fetchGoogleCalendar() {
    if (!selected || selected.type !== 'calendar') return
    setCalendarBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await calendarApi.fetchGoogle(
        selected.props?.mail || googleStatus.googleEmail,
        selected.props?.days || 1
      )
      patchSelected({
        props: {
          mail: data.email || selected.props?.mail || '',
          title: data.title || selected.props?.title || "Today's Schedule",
          items: data.items || [],
          syncedAt: data.syncedAt,
          source: 'google',
        },
      })
      setMessage(
        data.count
          ? `Loaded ${data.count} event(s) from Google (${data.email})`
          : `No Google events found for ${data.email || 'this account'} in the selected range`
      )
    } catch (err) {
      setError(err.message)
      if (err.data?.connected === false || /expired|Reconnect|Connect Google/i.test(err.message || '')) {
        setGoogleStatus({ oauth: googleStatus.oauth, connected: false, googleEmail: '' })
      }
    } finally {
      setCalendarBusy(false)
    }
  }

  useEffect(() => {
    if (!googleStatus.connected) return undefined
    let stopped = false

    async function pullMeetings() {
      const current = displayRef.current
      const widgets = (current?.pages || []).flatMap((page) => page.widgets || [])
      const calendar = widgets.find((widget) => widget.type === 'calendar')
      if (!calendar) return
      try {
        const data = await calendarApi.fetchGoogle(
          googleStatus.googleEmail,
          calendar.props?.days || 1
        )
        if (stopped) return
        setDisplay((prev) => {
          if (!prev?.pages) return prev
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              widgets: (page.widgets || []).map((widget) =>
                widget.type === 'calendar'
                  ? {
                      ...widget,
                      props: {
                        ...widget.props,
                        items: data.items || [],
                        syncedAt: data.syncedAt,
                        mail: data.email || widget.props?.mail || '',
                        source: 'google',
                      },
                    }
                  : widget
              ),
            })),
          }
        })
      } catch {
        // Keep the meetings already on the canvas if Google is briefly unreachable.
      }
    }

    const timer = window.setInterval(pullMeetings, 60 * 1000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [googleStatus.connected, googleStatus.googleEmail])

  const page = display?.pages?.[pageIndex]
  const selected = useMemo(
    () => page?.widgets?.find((w) => w.id === selectedId) || null,
    [page, selectedId]
  )

  const pageSettingsOpen = selected ? showPageSettings : true

  function updateWidgets(updater) {
    setDisplay((prev) => {
      const pages = prev.pages.map((p, i) => {
        if (i !== pageIndex) return p
        return { ...p, widgets: updater(p.widgets || []) }
      })
      return { ...prev, pages }
    })
  }

  function patchWidget(widgetId, patch) {
    updateWidgets((widgets) =>
      widgets.map((w) =>
        w.id === widgetId ? { ...w, ...patch, props: { ...w.props, ...(patch.props || {}) } } : w
      )
    )
  }

  function addWidget(type) {
    const sizeByType = {
      dashboard: { w: 900, h: 120 },
      pdf: { w: 420, h: 520 },
      quotes: { w: 420, h: 220 },
      news: { w: 360, h: 280 },
      notes: { w: 280, h: 260 },
      heading: { w: 200, h: 48 },
      text: { w: 220, h: 48 },
    }
    const { w, h } = sizeByType[type] || { w: 300, h: 160 }
    const offset = (page?.widgets?.length || 0) * 20

    const propsByType = {
      weather: { city: 'Pune', temp: 28, condition: 'Partly Cloudy' },
      heading: {
        text: 'Page heading',
        fontSize: 32,
        bold: true,
        align: 'left',
      },
      text: {
        body: 'Add your message here.',
        fontSize: 16,
        bold: false,
        align: 'left',
      },
      notes: {
        title: 'Team Notes',
        items: [
          { text: 'Check lobby screen before 9am' },
          { text: 'Update visitor Wi‑Fi passcode' },
          { text: 'Post weekly KPI board' },
        ],
      },
      news: {
        title: 'Headlines',
        items: [
          { headline: 'New data hall commissioning complete', source: 'Ops' },
          { headline: 'Maintenance window this Saturday 2–4am', source: 'NOC' },
          { headline: 'Q3 utilization up 12%', source: 'Leadership' },
        ],
      },
      quotes: {
        body: 'Excellence is not an act, but a habit.',
        author: 'Aristotle',
        role: '',
      },
      calendar: {
        title: "Today's Schedule",
        mail: '',
        mails: [],
        days: 1,
        items: [
          { time: '10:00', label: 'NOC standup' },
          { time: '13:30', label: 'Client walkthrough' },
        ],
      },
      dashboard: {
        title: 'Company KPIs',
        metrics: [
          { label: 'Projects', value: 42 },
          { label: 'In Progress', value: 18 },
          { label: 'Overdue', value: 8 },
        ],
      },
    }

    let widget = {
      id: uid(),
      type,
      x: clamp(60 + offset, 0, CANVAS_W - w),
      y: clamp(60 + offset, 0, CANVAS_H - h),
      w,
      h,
      props: propsByType[type] || {},
    }
    if (type === 'clock') {
      const size = measureClockSize(1)
      if (size) widget = { ...widget, w: size.w, h: size.h }
    }
    if (type === 'quotes') {
      const size = measureQuoteSize({ ...widget, props: { ...widget.props, scale: 1 } })
      if (size) widget = { ...widget, w: size.w, h: size.h }
    }
    if (isHugWidget(type)) widget = hugWidget(widget)
    updateWidgets((widgets) => [...widgets, widget])
    setSelectedId(widget.id)
    setShowWidgetPicker(false)
    setMobileWidgetsOpen(false)
  }

  function duplicateWidget(widget) {
    if (!widget) return
    const clone = {
      ...JSON.parse(JSON.stringify(widget)),
      id: uid(),
      x: clamp(widget.x + 24, 0, CANVAS_W - widget.w),
      y: clamp(widget.y + 24, 0, CANVAS_H - widget.h),
    }
    updateWidgets((widgets) => [...widgets, clone])
    setSelectedId(clone.id)
    setMessage('Widget copied')
  }

  function editSelectedWidget() {
    if (!selected) return
    setShowPageSettings(false)
    setMobilePropsOpen(true)
    setMobileWidgetsOpen(false)
    setShowWidgetPicker(false)
  }

  function patchSelectedGeometry(patch) {
    if (!selected) return
    const { minW, minH } = isCopyWidget(selected.type)
      ? copyWidgetMinSize(selected.type)
      : { minW: MIN_W, minH: MIN_H }
    let x = patch.x != null ? Number(patch.x) : selected.x
    let y = patch.y != null ? Number(patch.y) : selected.y
    let w = patch.w != null ? Number(patch.w) : selected.w
    let h = patch.h != null ? Number(patch.h) : selected.h

    w = clamp(Number.isFinite(w) ? w : minW, minW, CANVAS_W)
    h = clamp(Number.isFinite(h) ? h : minH, minH, CANVAS_H)
    x = clamp(Number.isFinite(x) ? x : 0, 0, CANVAS_W - w)
    y = clamp(Number.isFinite(y) ? y : 0, 0, CANVAS_H - h)
    w = clamp(w, minW, CANVAS_W - x)
    h = clamp(h, minH, CANVAS_H - y)

    patchSelected({ x, y, w, h })
  }

  function patchSelected(patch) {
    if (!selectedId) return
    patchWidget(selectedId, patch)
  }

  /** Update quote text. The frame stays put and the words stretch to fill it. */
  function patchSelectedQuoteProps(propsPatch) {
    if (!selected || selected.type !== 'quotes') return
    patchSelected({ props: propsPatch })
  }

  /** Update heading/text props and shrink/grow the frame to the content. */
  function patchSelectedCopyProps(propsPatch) {
    if (!selected || !isCopyWidget(selected.type)) return
    const next = {
      ...selected,
      props: { ...selected.props, ...propsPatch },
    }
    const size = measureCopyWidgetSize(next)
    patchSelected({ props: propsPatch, ...(size || {}) })
  }

  function flipSelected() {
    if (!selected) {
      setMessage('Select a widget to flip')
      return
    }
    const flipped = !selected.props?.flipH
    patchWidget(selected.id, {
      props: { flipH: flipped },
    })
    setMessage(flipped ? 'Widget flipped horizontally' : 'Widget flip removed')
  }

  function setPageTimer(seconds) {
    const value = clamp(Number(seconds) || 10, 1, 600)
    setDisplay((prev) => {
      const pages = prev.pages.map((p, i) =>
        i === pageIndex ? { ...p, durationSec: value } : p
      )
      return { ...prev, pages }
    })
    setCustomTimer(String(value))
    setShowTimerMenu(false)
    setMessage(`Page timer set to ${value}s`)
  }

  function movePage(fromIndex, toIndex) {
    if (!display?.pages?.length) return
    const last = display.pages.length - 1
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex > last ||
      toIndex > last ||
      fromIndex === toIndex
    ) {
      return
    }

    setDisplay((prev) => {
      const pages = [...prev.pages]
      const [moved] = pages.splice(fromIndex, 1)
      pages.splice(toIndex, 0, moved)
      return { ...prev, pages }
    })
    setPageIndex(toIndex)
    setSelectedId(null)
    setContextMenu(null)
    setMessage('Page order updated')
    setError('')
  }

  function deletePage(index) {
    if (!display?.pages?.length) return
    if (display.pages.length <= 1) {
      setError('A display needs at least one page.')
      return
    }
    const name = display.pages[index]?.name || `Page ${index + 1}`
    setPageToDelete({ index, name })
  }

  function confirmDeletePage() {
    if (!pageToDelete) return
    const { index, name } = pageToDelete
    setPageToDelete(null)

    setDisplay((prev) => {
      const pages = prev.pages.filter((_, i) => i !== index)
      return { ...prev, pages }
    })
    setSelectedId(null)
    setContextMenu(null)
    setPageIndex((current) => {
      if (index < current) return current - 1
      if (index === current) return Math.max(0, Math.min(current, display.pages.length - 2))
      return current
    })
    setMessage(`Deleted ${name}`)
    setError('')
  }

  function addPage() {
    setDisplay((prev) => {
      const nextIndex = prev.pages.length
      return {
        ...prev,
        pages: [
          ...prev.pages,
          {
            id: uid(),
            name: `Page ${nextIndex + 1}`,
            durationSec: 10,
            backgroundColor: '#ffffff',
            widgets: [],
          },
        ],
      }
    })
    setSelectedId(null)
    setPageIndex(display.pages.length)
  }

  function setPageSchedule(schedule) {
    setDisplay((prev) => ({
      ...prev,
      pages: prev.pages.map((p, i) => (i === pageIndex ? { ...p, schedule } : p)),
    }))
  }

  function setDisplaySchedule(schedule) {
    setDisplay((prev) => ({ ...prev, schedule }))
  }

  function setPageBackground(color) {
    const next = String(color || '#ffffff').trim() || '#ffffff'
    setDisplay((prev) => {
      const pages = prev.pages.map((p, i) =>
        i === pageIndex ? { ...p, backgroundColor: next } : p
      )
      return { ...prev, pages }
    })
    setMessage('Screen background updated')
  }

  function patchPage(patch) {
    setDisplay((prev) => ({
      ...prev,
      pages: prev.pages.map((p, i) => (i === pageIndex ? { ...p, ...patch } : p)),
    }))
  }

  function setPageOverlay(patch) {
    const current = normalizeOverlay(page?.overlay)
    patchPage({ overlay: { ...current, ...patch } })
  }

  function moveWidgetLayer(widgetId, direction) {
    updateWidgets((widgets) => {
      const index = widgets.findIndex((w) => w.id === widgetId)
      if (index < 0) return widgets
      const target = direction === 'up' ? index + 1 : index - 1
      if (target < 0 || target >= widgets.length) return widgets
      const next = [...widgets]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function duplicatePage() {
    if (!page || !display) return
    const clone = JSON.parse(JSON.stringify(page))
    clone.id = uid()
    clone.name = `${page.name || 'Page'} copy`
    setDisplay((prev) => ({
      ...prev,
      pages: [
        ...prev.pages.slice(0, pageIndex + 1),
        clone,
        ...prev.pages.slice(pageIndex + 1),
      ],
    }))
    setPageIndex(pageIndex + 1)
    setSelectedId(null)
    setMessage('Page copied')
  }

  function deleteWidget(widgetId) {
    updateWidgets((widgets) => widgets.filter((w) => w.id !== widgetId))
    if (selectedId === widgetId) setSelectedId(null)
    setContextMenu(null)
  }

  function openContextMenu(e, widget) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(widget.id)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      widgetId: widget.id,
      type: widget.type,
    })
  }

  useEffect(() => {
    if (!contextMenu) return undefined

    function close() {
      setContextMenu(null)
    }

    function onKey(e) {
      if (e.key === 'Escape') close()
    }

    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  useEffect(() => {
    function onKey(e) {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !selectedId) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      deleteWidget(selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, pageIndex])

  function isTypingTarget(target) {
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  }

  function getCanvasPoint(clientX, clientY) {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const scaleX = rect.width / CANVAS_W
    const scaleY = rect.height / CANVAS_H
    return {
      x: (clientX - rect.left) / scaleX,
      y: (clientY - rect.top) / scaleY,
    }
  }

  function startDrag(e, widget) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(widget.id)
    const point = getCanvasPoint(e.clientX, e.clientY)
    dragRef.current = {
      mode: 'move',
      id: widget.id,
      startX: point.x,
      startY: point.y,
      origX: widget.x,
      origY: widget.y,
      origW: widget.w,
      origH: widget.h,
    }
  }

  function startResize(e, widget, handle) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(widget.id)
    const point = getCanvasPoint(e.clientX, e.clientY)
    const mins = isCopyWidget(widget.type)
      ? copyWidgetMinSize(widget.type)
      : { minW: MIN_W, minH: MIN_H }
    dragRef.current = {
      mode: 'resize',
      handle,
      id: widget.id,
      type: widget.type,
      props: widget.props || {},
      startX: point.x,
      startY: point.y,
      origX: widget.x,
      origY: widget.y,
      origW: widget.w,
      origH: widget.h,
      minW: mins.minW,
      minH: mins.minH,
    }
  }

  useEffect(() => {
    function onMove(e) {
      const drag = dragRef.current
      if (!drag) return
      const point = getCanvasPoint(e.clientX, e.clientY)
      const dx = point.x - drag.startX
      const dy = point.y - drag.startY

      if (drag.mode === 'move') {
        const x = clamp(Math.round(drag.origX + dx), 0, CANVAS_W - drag.origW)
        const y = clamp(Math.round(drag.origY + dy), 0, CANVAS_H - drag.origH)
        patchWidget(drag.id, { x, y })
        return
      }

      let { origX: x, origY: y, origW: w, origH: h } = drag
      const handle = drag.handle

      if (isHugWidget(drag.type)) {
        let trialW = drag.origW
        let trialH = drag.origH
        if (handle.includes('e')) trialW = drag.origW + dx
        if (handle.includes('s')) trialH = drag.origH + dy
        if (handle.includes('w')) trialW = drag.origW - dx
        if (handle.includes('n')) trialH = drag.origH - dy
        const horizontal = handle.includes('e') || handle.includes('w')
        const vertical = handle.includes('n') || handle.includes('s')
        const widthRatio = trialW / drag.origW
        const heightRatio = trialH / drag.origH
        let ratio = 1
        if (horizontal && vertical) {
          ratio = Math.abs(widthRatio - 1) >= Math.abs(heightRatio - 1) ? widthRatio : heightRatio
        } else if (horizontal) ratio = widthRatio
        else ratio = heightRatio
        ratio = clamp(ratio, 0.25, 8)

        const baseFont = Number(drag.props?.fontSize) || (drag.type === 'heading' ? 32 : 16)
        const nextFont = clamp(Math.round(baseFont * ratio), 8, 220)
        const size = measureCopyWidgetSize({
          type: drag.type,
          x: drag.origX,
          y: drag.origY,
          props: { ...drag.props, fontSize: nextFont },
        })
        if (size) {
          patchWidget(drag.id, {
            ...placeHug(handle, drag, size),
            props: { fontSize: nextFont },
          })
        }
        return
      }

      const minW = drag.minW || MIN_W
      const minH = drag.minH || MIN_H

      if (handle.includes('e')) w = drag.origW + dx
      if (handle.includes('s')) h = drag.origH + dy
      if (handle.includes('w')) {
        w = drag.origW - dx
        x = drag.origX + dx
      }
      if (handle.includes('n')) {
        h = drag.origH - dy
        y = drag.origY + dy
      }

      if (w < minW) {
        if (handle.includes('w')) x = drag.origX + drag.origW - minW
        w = minW
      }
      if (h < minH) {
        if (handle.includes('n')) y = drag.origY + drag.origH - minH
        h = minH
      }

      x = clamp(Math.round(x), 0, CANVAS_W - minW)
      y = clamp(Math.round(y), 0, CANVAS_H - minH)
      w = clamp(Math.round(w), minW, CANVAS_W - x)
      h = clamp(Math.round(h), minH, CANVAS_H - y)

      patchWidget(drag.id, { x, y, w, h })
    }

    function onUp() {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [pageIndex])

  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(() => setMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function save() {
    try {
      setSaving(true)
      setMessage('')
      setError('')
      const { display: updated } = await displaysApi.update(id, {
        pages: display.pages.map((page) => ({
          ...page,
          schedule: serializeSchedule(page.schedule),
        })),
        schedule: serializeSchedule(display.schedule),
        department: display.department || '',
      })
      setDisplay(updated)
      setMessage('Saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    try {
      setSaving(true)
      const data = await displaysApi.publish(id)
      setDisplay(data.display)
      setPlayerUrl(data.playerUrl)
      setShowUrlModal(true)
      setMessage('Published')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function togglePlayback() {
    if (!display) return
    try {
      setSaving(true)
      const data = display.playbackStopped
        ? await displaysApi.resume(id)
        : await displaysApi.stop(id)
      setDisplay(data.display)
      setMessage(display.playbackStopped ? 'Display resumed on screen' : 'Display stopped on screen')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!showTimerMenu) return undefined
    function close() {
      // Clicks inside the menu call stopPropagation, so anything reaching
      // the window means the user clicked away.
      setShowTimerMenu(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setShowTimerMenu(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [showTimerMenu])

  useEffect(() => {
    setCustomTimer(String(page?.durationSec || 10))
  }, [pageIndex, page?.durationSec])

  if (error && !display) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-[#e8eaee] px-6 text-center">
        <p className="max-w-md text-sm text-red-600">{error}</p>
      </div>
    )
  }
  if (!display) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-[#e8eaee] text-sm font-semibold text-gray-500">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Opening editor...
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#e8eaee]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-2 py-2 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <BackButton fallback="/app/displays" className="!px-2.5 !py-1.5 text-xs sm:text-sm" />
          <Link to="/app/displays" className="flex shrink-0 items-center" title="Back to My Displays">
            <img
              src={logo}
              alt="Profile Solution"
              className="h-9 w-auto max-w-[140px] object-contain object-left sm:h-11 sm:max-w-[200px] lg:h-12 lg:max-w-none"
            />
          </Link>
        </div>

        <div className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:mx-auto sm:w-auto sm:flex-1 sm:justify-center sm:gap-2">
          {display.pages.length > 1 ? (
            <button
              type="button"
              title="Move page left"
              aria-label="Move page left"
              disabled={pageIndex <= 0}
              onClick={() => movePage(pageIndex, pageIndex - 1)}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon size={16} />
            </button>
          ) : null}
          {display.pages.map((p, i) => (
            <div
              key={p.id}
              draggable={display.pages.length > 1}
              onDragStart={(e) => {
                setDragPageFrom(i)
                setDragPageOver(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragPageOver !== i) setDragPageOver(i)
              }}
              onDragLeave={() => {
                if (dragPageOver === i) setDragPageOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from =
                  dragPageFrom ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10)
                if (Number.isFinite(from)) movePage(from, i)
                setDragPageFrom(null)
                setDragPageOver(null)
              }}
              onDragEnd={() => {
                setDragPageFrom(null)
                setDragPageOver(null)
              }}
              className={`group relative flex shrink-0 items-center rounded-lg transition ${
                i === pageIndex ? 'bg-brand/25 text-gray-900' : 'text-gray-500 hover:bg-gray-100'
              } ${dragPageFrom === i ? 'opacity-50' : ''} ${
                dragPageOver === i && dragPageFrom !== null && dragPageFrom !== i
                  ? 'ring-2 ring-brand/60'
                  : ''
              } ${display.pages.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <button
                type="button"
                onClick={() => {
                  setPageIndex(i)
                  setSelectedId(null)
                }}
                title={
                  p.schedule?.enabled
                    ? describeSchedule(p.schedule)
                    : display.pages.length > 1
                      ? 'Drag to reorder pages'
                      : undefined
                }
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm"
              >
                {p.name || `Page ${i + 1}`}
                {p.schedule?.enabled ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="Has a schedule"
                  />
                ) : null}
              </button>
              {display.pages.length > 1 ? (
                <button
                  type="button"
                  title={`Delete ${p.name || `Page ${i + 1}`}`}
                  aria-label={`Delete ${p.name || `Page ${i + 1}`}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    deletePage(i)
                  }}
                  className={`mr-1 rounded p-0.5 text-sm leading-none transition ${
                    i === pageIndex
                      ? 'text-gray-600 hover:bg-red-100 hover:text-red-600'
                      : 'text-transparent group-hover:text-gray-400 hover:!bg-red-100 hover:!text-red-600'
                  }`}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          {display.pages.length > 1 ? (
            <button
              type="button"
              title="Move page right"
              aria-label="Move page right"
              disabled={pageIndex >= display.pages.length - 1}
              onClick={() => movePage(pageIndex, pageIndex + 1)}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRightIcon size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={addPage}
            className="shrink-0 rounded-lg px-2 py-1 text-lg text-gray-500 hover:bg-gray-100"
            title="Add page"
          >
            +
          </button>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 lg:hidden"
            onClick={() => {
              setMobileWidgetsOpen((v) => !v)
              setMobilePropsOpen(false)
            }}
          >
            Widgets
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 lg:hidden"
            onClick={() => {
              setMobilePropsOpen((v) => !v)
              setMobileWidgetsOpen(false)
            }}
          >
            Props
          </button>
          <button
            type="button"
            disabled={saving || !display?.published}
            onClick={togglePlayback}
            title={
              display?.playbackStopped
                ? 'Resume live display'
                : 'Stop the live display (blank screen)'
            }
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm ${
              display?.playbackStopped
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700'
            } disabled:opacity-40`}
          >
            {display?.playbackStopped ? 'Resume' : 'Stop'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (playerUrl) setShowUrlModal(true)
              else publish()
            }}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:text-sm"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:text-sm"
          >
            Save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={publish}
            className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white sm:px-3 sm:text-sm"
          >
            Publish
          </button>
        </div>
      </header>

      {(message || error) && (
        <div
          className={`flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm ${
            error ? 'bg-red-950 text-red-200' : 'bg-[#121212] text-white/70'
          }`}
        >
          <span className="min-w-0 flex-1">{message || error}</span>
          <button
            type="button"
            onClick={() => {
              setMessage('')
              setError('')
            }}
            className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[13rem_minmax(0,1fr)_18rem] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        {/* Widgets */}
        <aside
          className={`z-40 flex min-h-0 flex-col overflow-hidden border-gray-200 bg-white lg:relative lg:z-auto lg:flex lg:w-auto lg:border-r lg:shadow-none ${
            mobileWidgetsOpen
              ? 'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(18rem,85vw)] max-lg:border-r max-lg:shadow-2xl'
              : 'max-lg:hidden'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 lg:hidden">
            <span className="text-sm font-bold text-gray-900">Widgets</span>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-600"
              onClick={() => setMobileWidgetsOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="relative hidden flex-wrap gap-2 border-b border-gray-100 p-3 lg:flex">
            <button
              type="button"
              onClick={flipSelected}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                selected?.props?.flipH ? 'bg-brand/25 text-gray-900' : 'bg-gray-100 text-gray-700'
              }`}
              title="Flip selected widget horizontally"
            >
              Flip
            </button>

            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setCustomTimer(String(page?.durationSec || 10))
                  setShowTimerMenu((v) => !v)
                }}
                className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
                title="Change page slide timer"
              >
                Timer {page?.durationSec || 10}s
              </button>

              {/* Anchored to the toolbar row rather than the button, so it spans the
                  sidebar instead of overflowing it and being clipped. */}
              {showTimerMenu ? (
                <div
                  className="absolute left-3 right-3 top-full z-40 mt-1 rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Page duration
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {TIMER_PRESETS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setPageTimer(sec)}
                        className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
                          (page?.durationSec || 10) === sec
                            ? 'bg-brand text-white'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={customTimer}
                      onChange={(e) => setCustomTimer(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                      placeholder="Custom"
                    />
                    <button
                      type="button"
                      onClick={() => setPageTimer(customTimer)}
                      className="shrink-0 rounded-lg bg-brand px-2 py-1.5 text-xs font-bold text-white"
                    >
                      Set
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => selected && duplicateWidget(selected)}
              className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedId) return
                deleteWidget(selectedId)
              }}
              className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-600"
            >
              Delete
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2 sm:p-3">
            {WIDGET_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addWidget(type)}
                className="shrink-0 rounded-lg px-3 py-2.5 text-left text-sm font-semibold capitalize text-gray-700 hover:bg-brand/15"
              >
                {type}
              </button>
            ))}
          </div>
        </aside>

        {mobileWidgetsOpen || mobilePropsOpen ? (
          <button
            type="button"
            aria-label="Close panel"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => {
              setMobileWidgetsOpen(false)
              setMobilePropsOpen(false)
            }}
          />
        ) : null}

        {/* Stage — fills all remaining space; canvas scales to fit */}
        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#e8eaee]">
          {/* Mango-style page toolbar */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-black/5 bg-white/90 px-2 py-1.5 backdrop-blur-sm sm:gap-2 sm:px-3">
            <button
              type="button"
              title="Background"
              onClick={() => {
                setShowPageSettings(true)
                setMobilePropsOpen(true)
                setSelectedId(null)
                setShowLayersPanel(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              <ImageIcon size={15} />
              <span className="hidden sm:inline">Background</span>
            </button>
            <button
              type="button"
              title="Page timer"
              onClick={() => {
                setShowPageSettings(true)
                setMobilePropsOpen(true)
                setSelectedId(null)
                setShowLayersPanel(false)
                setCustomTimer(String(page?.durationSec || 10))
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              <span className="tabular-nums">{page?.durationSec || 10}s</span>
            </button>
            <button
              type="button"
              title="Copy page"
              onClick={duplicatePage}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              <CopyIcon size={15} />
              <span className="hidden sm:inline">Copy</span>
            </button>
            <button
              type="button"
              title="Delete page"
              onClick={() => deletePage(pageIndex)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <TrashIcon size={15} />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <button
              type="button"
              title="Overlays"
              onClick={() => {
                setShowOverlayPanel((v) => !v)
                setShowLayersPanel(false)
                setShowWidgetPicker(false)
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                showOverlayPanel || (page?.overlay?.type && page.overlay.type !== 'none')
                  ? 'bg-brand/20 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <SparklesIcon size={15} />
              <span className="hidden sm:inline">Overlays</span>
            </button>
            <button
              type="button"
              title="Widget layers"
              onClick={() => {
                setShowLayersPanel((v) => !v)
                setShowOverlayPanel(false)
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                showLayersPanel ? 'bg-brand/20 text-gray-900' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <LayersIcon size={15} />
              <span className="hidden sm:inline">Layers</span>
            </button>
          </div>

          <div ref={stageRef} className="relative min-h-0 flex-1 w-full">
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: CANVAS_W * stageScale,
                height: CANVAS_H * stageScale,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                ref={canvasRef}
                className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
                style={{
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${stageScale})`,
                  transformOrigin: 'top left',
                  backgroundColor: page?.backgroundColor || '#ffffff',
                }}
                onPointerDown={() => {
                  setSelectedId(null)
                  setContextMenu(null)
                  setShowWidgetPicker(false)
                  setShowOverlayPanel(false)
                }}
              >
                {page?.backgroundImage ? (
                  <img
                    src={resolveMediaUrl(page.backgroundImage)}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{
                      objectFit: page.backgroundFit || 'cover',
                      filter: `brightness(${(Number(page.backgroundBrightness) || 100) / 100})`,
                    }}
                  />
                ) : null}

                {(page?.widgets || []).map((w, layerIndex) => {
                  const isSelected = selectedId === w.id
                  const opacity = Number(w.props?.opacity)
                  const cornerRadius = Number(w.props?.cornerRadius)
                  const shadowOff = w.props?.shadow === false
                  return (
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => startDrag(e, w)}
                      onContextMenu={(e) => openContextMenu(e, w)}
                      className={`absolute select-none overflow-visible text-left ${
                        isSelected
                          ? 'z-20 ring-2 ring-brand'
                          : w.type === 'clock' ||
                              w.type === 'quotes' ||
                              w.type === 'image' ||
                              w.type === 'heading' ||
                              w.type === 'text'
                            ? 'z-10'
                            : 'z-10 ring-1 ring-black/10'
                      }`}
                      style={{
                        left: w.x,
                        top: w.y,
                        width: w.w,
                        height: w.h,
                        zIndex: isSelected ? 30 : 10 + layerIndex,
                        cursor: 'move',
                        touchAction: 'none',
                        opacity: Number.isFinite(opacity) ? opacity : 1,
                        borderRadius: Number.isFinite(cornerRadius) ? cornerRadius : 14,
                        boxShadow: shadowOff
                          ? 'none'
                          : w.type === 'heading' || w.type === 'text' || w.type === 'clock' || w.type === 'quotes' || w.type === 'image'
                            ? undefined
                            : '0 12px 32px rgba(15,23,42,0.18)',
                      }}
                    >
                      <div
                        className="pointer-events-none h-full w-full overflow-hidden"
                        style={{
                          borderRadius: 'inherit',
                          transform: w.props?.flipH ? 'scaleX(-1)' : undefined,
                          filter: w.props?.blur ? `blur(${Number(w.props.blur) || 0}px)` : undefined,
                        }}
                      >
                        <WidgetPreview
                          widget={w}
                          pageBackground={page?.backgroundColor || '#ffffff'}
                        />
                      </div>

                      {isSelected
                        ? RESIZE_HANDLES.map((handle) => (
                            <span
                              key={handle.key}
                              onPointerDown={(e) => startResize(e, w, handle.key)}
                              className="absolute z-30 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand shadow sm:h-3 sm:w-3"
                              style={{
                                ...handle.style,
                                cursor: handle.cursor,
                                touchAction: 'none',
                              }}
                            />
                          ))
                        : null}
                    </div>
                  )
                })}

                <VisualOverlay overlay={page?.overlay} forceShow className="z-[25]" />
              </div>
            </div>

            {selected ? (
              <div
                className="absolute z-30 flex items-center gap-0.5 rounded-full bg-[#2c3038] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                style={{
                  left: `calc(50% - ${(CANVAS_W * stageScale) / 2}px + ${(selected.x + selected.w / 2) * stageScale}px)`,
                  top: `calc(50% - ${(CANVAS_H * stageScale) / 2}px + ${selected.y * stageScale}px - 10px)`,
                  transform: 'translate(-50%, -100%)',
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  title="Edit"
                  aria-label="Edit widget"
                  onClick={(e) => {
                    e.stopPropagation()
                    editSelectedWidget()
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10 hover:text-white"
                >
                  <PencilIcon size={16} />
                </button>
                <button
                  type="button"
                  title="Copy"
                  aria-label="Copy widget"
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateWidget(selected)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10 hover:text-white"
                >
                  <CopyIcon size={16} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  aria-label="Delete widget"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteWidget(selected.id)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-red-500/90 hover:text-white"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ) : null}

            {saving ? (
              <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-[#1f2329]/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Saving…
              </div>
            ) : null}

            {showOverlayPanel ? (
              <OverlayPanel
                overlay={page?.overlay}
                onChange={setPageOverlay}
                onClose={() => setShowOverlayPanel(false)}
              />
            ) : null}

            {showLayersPanel ? (
              <div
                className="absolute left-4 top-4 z-30 w-56 max-h-[min(20rem,50vh)] overflow-auto rounded-2xl border border-black/5 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.2)]"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Layers
                  </p>
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => setShowLayersPanel(false)}
                    aria-label="Close layers"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
                {[...(page?.widgets || [])].reverse().map((w, revIndex, arr) => {
                  const index = arr.length - 1 - revIndex
                  return (
                    <div
                      key={w.id}
                      className={`mb-0.5 flex items-center gap-1 rounded-xl px-2 py-1.5 ${
                        selectedId === w.id ? 'bg-brand/15' : 'hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs font-semibold capitalize text-gray-800"
                        onClick={() => setSelectedId(w.id)}
                      >
                        {w.type}
                      </button>
                      <button
                        type="button"
                        title="Bring forward"
                        disabled={index >= (page?.widgets?.length || 0) - 1}
                        onClick={() => moveWidgetLayer(w.id, 'up')}
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Send backward"
                        disabled={index <= 0}
                        onClick={() => moveWidgetLayer(w.id, 'down')}
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  )
                })}
                {!page?.widgets?.length ? (
                  <p className="px-2 py-3 text-xs text-gray-400">No widgets on this page.</p>
                ) : null}
              </div>
            ) : null}

            <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-3">
              {showWidgetPicker ? (
                <div
                  className="max-h-[min(22rem,55vh)] w-52 overflow-auto rounded-2xl border border-black/5 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.22)]"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Add widget
                  </p>
                  <div className="grid gap-0.5">
                    {WIDGET_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addWidget(type)}
                        className="rounded-xl px-3 py-2 text-left text-sm font-semibold capitalize text-gray-800 hover:bg-brand/15"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                title="Add widget"
                aria-label="Add widget"
                aria-expanded={showWidgetPicker}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowWidgetPicker((v) => !v)
                  setSelectedId(null)
                  setContextMenu(null)
                }}
                className={`grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-[0_10px_28px_rgba(139,197,63,0.45)] transition hover:brightness-105 active:scale-95 ${
                  showWidgetPicker ? 'ring-4 ring-brand/30' : ''
                }`}
              >
                <PlusIcon
                  size={28}
                  className={`transition-transform ${showWidgetPicker ? 'rotate-45' : ''}`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Properties */}
        {/* The drawer styles are scoped to max-lg so the fixed 20rem width cannot
            leak into the desktop grid column, where it would overflow the track
            and get clipped by the parent's overflow-hidden. */}
        <aside
          className={`z-40 min-h-0 overflow-y-auto overflow-x-hidden border-gray-200 bg-white p-3 sm:p-4 lg:relative lg:z-auto lg:block lg:w-auto lg:border-l lg:shadow-none ${
            mobilePropsOpen
              ? 'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:w-[min(20rem,90vw)] max-lg:border-l max-lg:shadow-2xl'
              : 'max-lg:hidden'
          }`}
        >
          <div className="mb-3 flex items-center justify-between lg:mb-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-900">
              {selected ? selected.type : 'Properties'}
            </h3>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-600 lg:hidden"
              onClick={() => setMobilePropsOpen(false)}
            >
              Close
            </button>
          </div>

          {/* With a widget selected these page-wide settings collapse, so the
              widget's own properties stay at the top of the panel. */}
          {selected ? (
            <button
              type="button"
              onClick={() => setShowPageSettings((open) => !open)}
              aria-expanded={pageSettingsOpen}
              className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left transition hover:border-brand/40"
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Page &amp; display settings
              </span>
              <span className="text-[11px] font-semibold text-gray-400">
                {pageSettingsOpen ? 'Hide' : 'Show'}
              </span>
            </button>
          ) : null}

          <div className={pageSettingsOpen ? '' : 'hidden'}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Screen background
            </div>
            <p className="mb-2 text-xs text-gray-500">Choose a background color for this page.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {BG_PRESETS.map((preset) => {
                const active =
                  (page?.backgroundColor || '#ffffff').toLowerCase() === preset.color.toLowerCase()
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => setPageBackground(preset.color)}
                    className={`relative h-9 w-9 rounded-xl border-2 shadow-sm transition hover:scale-105 ${
                      active ? 'border-brand ring-2 ring-brand/30' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: preset.color }}
                  >
                    {preset.color.toLowerCase() === '#ffffff' ? (
                      <span className="pointer-events-none absolute inset-0 rounded-[10px] border border-gray-200" />
                    ) : null}
                  </button>
                )
              })}
            </div>
            <label className="mb-5 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-xs font-semibold text-gray-600">Custom</span>
              <input
                type="color"
                value={page?.backgroundColor || '#ffffff'}
                onChange={(e) => setPageBackground(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Custom background color"
              />
              <span className="font-mono text-xs text-gray-500">
                {page?.backgroundColor || '#ffffff'}
              </span>
            </label>

            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Background image
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Optional full-bleed image under widgets (URL or media library).
            </p>
            <input
              value={page?.backgroundImage || ''}
              onChange={(e) => patchPage({ backgroundImage: e.target.value })}
              placeholder="https://… or /uploads/…"
              className="mb-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">Fit</span>
                <select
                  value={page?.backgroundFit || 'cover'}
                  onChange={(e) => patchPage({ backgroundFit: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Brightness</span>
                <input
                  type="range"
                  min={40}
                  max={140}
                  value={page?.backgroundBrightness ?? 100}
                  onChange={(e) => patchPage({ backgroundBrightness: Number(e.target.value) })}
                  className="mt-2 w-full"
                />
              </label>
            </div>
            {library.filter((m) => m.type === 'image').length ? (
              <div className="mb-5 grid max-h-28 grid-cols-4 gap-1 overflow-auto">
                {library
                  .filter((m) => m.type === 'image')
                  .slice(0, 12)
                  .map((m) => (
                    <button
                      key={m._id || m.url}
                      type="button"
                      onClick={() => patchPage({ backgroundImage: canonicalMediaRef(m.url) || m.url })}
                      className="overflow-hidden rounded-lg border border-gray-200"
                    >
                      <img src={resolveMediaUrl(m.url)} alt="" className="h-12 w-full object-cover" />
                    </button>
                  ))}
              </div>
            ) : (
              <p className="mb-5 text-[11px] text-gray-400">Upload images in Media to pick quickly.</p>
            )}

            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Visual overlays
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Or use the Overlays button in the page toolbar for the full picker.
            </p>
            <div className="mb-2 rounded-xl border border-gray-100 bg-white p-2">
              <OverlayIconGrid
                value={page?.overlay?.type}
                onSelect={(type) => setPageOverlay({ type })}
              />
            </div>
            {(page?.overlay?.type || 'none') !== 'none' ? (
              <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <OverlaySettingsForm overlay={page?.overlay} onChange={setPageOverlay} />
              </div>
            ) : (
              <div className="mb-5" />
            )}

            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Page timer
            </div>
            <p className="mb-2 text-xs text-gray-500">
              How long this page stays on screen before switching.
            </p>
            <div className="mb-4 flex flex-wrap gap-1">
              {TIMER_PRESETS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setPageTimer(sec)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                    (page?.durationSec || 10) === sec
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <div className="mb-5 flex gap-1">
              <input
                type="number"
                min={1}
                max={600}
                value={customTimer}
                onChange={(e) => setCustomTimer(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                placeholder="Custom seconds"
              />
              <button
                type="button"
                onClick={() => setPageTimer(customTimer)}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white"
              >
                Set
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <ScheduleEditor
                title={`${page?.name || 'This page'} schedule`}
                value={page?.schedule}
                onChange={setPageSchedule}
                compact
              />
            </div>

            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <ScheduleEditor
                title="Whole display schedule"
                value={display.schedule}
                onChange={setDisplaySchedule}
              />
              <p className="mt-2 text-[11px] text-gray-500">
                When this is off-schedule the screen goes dark, whatever the pages say.
              </p>
            </div>
          </div>

          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Flip
              </div>
              <button
                type="button"
                onClick={flipSelected}
                className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-gray-800"
              >
                {selected.props?.flipH ? 'Unflip horizontally' : 'Flip horizontally'}
              </button>

              {/* Number inputs have a wide intrinsic minimum, so grid items must be
                  allowed to shrink or they overflow this narrow panel. */}
              <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                <label className="block">
                  <span className="text-xs text-gray-500">X</span>
                  <input
                    type="number"
                    value={selected.x}
                    onChange={(e) => patchSelectedGeometry({ x: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Y</span>
                  <input
                    type="number"
                    value={selected.y}
                    onChange={(e) => patchSelectedGeometry({ y: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">W</span>
                  <input
                    type="number"
                    value={selected.w}
                    onChange={(e) => patchSelectedGeometry({ w: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">H</span>
                  <input
                    type="number"
                    value={selected.h}
                    onChange={(e) => patchSelectedGeometry({ h: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Format
                </div>
                <label className="block">
                  <span className="text-xs text-gray-500">
                    Opacity ({Math.round((Number(selected.props?.opacity) || 1) * 100)}%)
                  </span>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={Number(selected.props?.opacity) || 1}
                    onChange={(e) =>
                      patchSelected({ props: { opacity: Number(e.target.value) } })
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Corners (px)</span>
                  <input
                    type="number"
                    min={0}
                    max={48}
                    value={
                      selected.props?.cornerRadius != null ? selected.props.cornerRadius : 14
                    }
                    onChange={(e) =>
                      patchSelected({ props: { cornerRadius: Number(e.target.value) } })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-700">
                  Drop shadow
                  <input
                    type="checkbox"
                    checked={selected.props?.shadow !== false}
                    onChange={(e) =>
                      patchSelected({ props: { shadow: e.target.checked } })
                    }
                    className="h-4 w-4 accent-[var(--color-brand,#8bc53f)]"
                  />
                </label>
              </div>

              {selected.type === 'heading' && (
                <div className="space-y-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Heading
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Large title for a page section — use Text for the paragraph below it.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Heading text</span>
                    <input
                      value={selected.props?.text || selected.props?.title || ''}
                      onChange={(e) =>
                        patchSelectedCopyProps({ text: e.target.value, title: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="e.g. Welcome / Today’s focus"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-gray-500">Font size</span>
                      <select
                        value={selected.props?.fontSize || 32}
                        onChange={(e) =>
                          patchSelectedCopyProps({ fontSize: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      >
                        {[20, 24, 28, 32, 40, 48, 56, 64].map((size) => (
                          <option key={size} value={size}>
                            {size}px
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">Weight</span>
                      <select
                        value={selected.props?.bold === false ? 'normal' : 'bold'}
                        onChange={(e) =>
                          patchSelectedCopyProps({ bold: e.target.value === 'bold' })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      >
                        <option value="bold">Bold</option>
                        <option value="normal">Regular</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500">Align</span>
                    <select
                      value={selected.props?.align || 'left'}
                      onChange={(e) => patchSelectedCopyProps({ align: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              )}

              {selected.type === 'text' && (
                <div className="space-y-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Text
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Body copy for the screen. Add a Heading widget separately for the title.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Text</span>
                    <textarea
                      value={selected.props?.body || ''}
                      onChange={(e) => patchSelectedCopyProps({ body: e.target.value })}
                      className="mt-1 h-28 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Add your message"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-gray-500">Font size</span>
                      <select
                        value={selected.props?.fontSize || 16}
                        onChange={(e) =>
                          patchSelectedCopyProps({ fontSize: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      >
                        {[12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                          <option key={size} value={size}>
                            {size}px
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">Weight</span>
                      <select
                        value={selected.props?.bold ? 'bold' : 'normal'}
                        onChange={(e) =>
                          patchSelectedCopyProps({ bold: e.target.value === 'bold' })
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      >
                        <option value="normal">Regular</option>
                        <option value="bold">Bold</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500">Align</span>
                    <select
                      value={selected.props?.align || 'left'}
                      onChange={(e) => patchSelectedCopyProps({ align: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              )}

              {selected.type === 'quotes' && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Quote
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Large centered quote for inspiration or leadership messages.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Quote</span>
                    <textarea
                      value={selected.props?.body || selected.props?.quote || ''}
                      onChange={(e) => patchSelectedQuoteProps({ body: e.target.value })}
                      className="mt-1 h-24 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Excellence is not an act, but a habit."
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Author</span>
                    <input
                      value={selected.props?.author || ''}
                      onChange={(e) => patchSelectedQuoteProps({ author: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Aristotle"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Role / source (optional)</span>
                    <input
                      value={selected.props?.role || ''}
                      onChange={(e) => patchSelectedQuoteProps({ role: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="CEO"
                    />
                  </label>
                </div>
              )}

              {selected.type === 'notes' && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Notes checklist
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Sticky-note style list — good for reminders and quick tasks.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Title</span>
                    <input
                      value={selected.props?.title || ''}
                      onChange={(e) => patchSelected({ props: { title: e.target.value } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Team Notes"
                    />
                  </label>
                  {(selected.props?.items || []).map((item, index) => (
                    <div
                      key={`note-${index}`}
                      className="grid grid-cols-[1fr_auto] gap-1.5 [&>*]:min-w-0"
                    >
                      <input
                        value={item.text || item.label || ''}
                        onChange={(e) => {
                          const items = [...(selected.props?.items || [])]
                          items[index] = { ...items[index], text: e.target.value }
                          patchSelected({ props: { items } })
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="Note line"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const items = (selected.props?.items || []).filter((_, i) => i !== index)
                          patchSelected({ props: { items } })
                        }}
                        className="rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(selected.props?.items || []), { text: 'New note' }]
                      patchSelected({ props: { items } })
                    }}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-600 hover:border-brand hover:text-gray-900"
                  >
                    + Add note
                  </button>
                </div>
              )}

              {selected.type === 'news' && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    News headlines
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Stack of short headlines with an optional source label.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Section title</span>
                    <input
                      value={selected.props?.title || ''}
                      onChange={(e) => patchSelected({ props: { title: e.target.value } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Headlines"
                    />
                  </label>
                  {(selected.props?.items || []).map((item, index) => (
                    <div key={`news-${index}`} className="space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
                      <input
                        value={item.headline || item.label || item.text || ''}
                        onChange={(e) => {
                          const items = [...(selected.props?.items || [])]
                          items[index] = { ...items[index], headline: e.target.value }
                          patchSelected({ props: { items } })
                        }}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="Headline"
                      />
                      <div className="grid grid-cols-[1fr_auto] gap-1.5 [&>*]:min-w-0">
                        <input
                          value={item.source || ''}
                          onChange={(e) => {
                            const items = [...(selected.props?.items || [])]
                            items[index] = { ...items[index], source: e.target.value }
                            patchSelected({ props: { items } })
                          }}
                          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          placeholder="Source (optional)"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const items = (selected.props?.items || []).filter((_, i) => i !== index)
                            patchSelected({ props: { items } })
                          }}
                          className="rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const items = [
                        ...(selected.props?.items || []),
                        { headline: 'New headline', source: '' },
                      ]
                      patchSelected({ props: { items } })
                    }}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-600 hover:border-brand hover:text-gray-900"
                  >
                    + Add headline
                  </button>
                </div>
              )}

              {selected.type === 'dashboard' && (
                <div className="space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Dashboard data
                  </div>
                  <p className="text-[11px] leading-snug text-gray-500">
                    Values are stored on this display (not from a live API). Edit below, then Save /
                    Publish.
                  </p>
                  <label className="block">
                    <span className="text-xs text-gray-500">Title</span>
                    <input
                      value={selected.props?.title || ''}
                      onChange={(e) => patchSelected({ props: { title: e.target.value } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Company KPIs"
                    />
                  </label>
                  {(selected.props?.metrics || []).map((metric, index) => (
                    <div
                      key={`metric-${index}`}
                      className="grid grid-cols-[1fr_72px_auto] gap-1.5 [&>*]:min-w-0"
                    >
                      <input
                        value={metric.label || ''}
                        onChange={(e) => {
                          const metrics = [...(selected.props?.metrics || [])]
                          metrics[index] = { ...metrics[index], label: e.target.value }
                          patchSelected({ props: { metrics } })
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="Label"
                      />
                      <input
                        type="number"
                        value={metric.value ?? ''}
                        onChange={(e) => {
                          const metrics = [...(selected.props?.metrics || [])]
                          metrics[index] = {
                            ...metrics[index],
                            value: e.target.value === '' ? '' : Number(e.target.value),
                          }
                          patchSelected({ props: { metrics } })
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const metrics = (selected.props?.metrics || []).filter((_, i) => i !== index)
                          patchSelected({ props: { metrics } })
                        }}
                        className="rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                        title="Remove metric"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const metrics = [
                        ...(selected.props?.metrics || []),
                        { label: 'New metric', value: 0 },
                      ]
                      patchSelected({ props: { metrics } })
                    }}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-700 hover:border-brand hover:bg-brand/5"
                  >
                    + Add metric
                  </button>
                </div>
              )}

              {selected.type === 'weather' && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Weather data
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500">Temperature (°C)</span>
                    <input
                      type="number"
                      value={selected.props?.temp ?? 28}
                      onChange={(e) => patchSelected({ props: { temp: Number(e.target.value) } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Condition</span>
                    <input
                      value={selected.props?.condition || ''}
                      onChange={(e) => patchSelected({ props: { condition: e.target.value } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="Partly Cloudy"
                    />
                  </label>
                </div>
              )}

              {selected.type === 'calendar' && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Google Calendar
                  </div>
                  <p className="text-[11px] leading-snug text-gray-500">
                    Personal Gmail cannot be shared with a service account. Connect Google with OAuth,
                    then fetch meetings.
                  </p>
                  {googleStatus.connected ? (
                    <div className="space-y-2">
                      <p className="break-all rounded-lg bg-brand/10 px-2 py-1.5 text-[11px] font-semibold text-gray-800">
                        Connected: {googleStatus.googleEmail || 'Google account'}
                      </p>
                      <button
                        type="button"
                        disabled={calendarBusy}
                        onClick={connectGoogleFromEditor}
                        className="w-full rounded-lg border border-gray-300 py-2 text-xs font-bold text-gray-800 disabled:opacity-60"
                      >
                        {calendarBusy ? 'Opening Google...' : 'Reconnect Google Account'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={calendarBusy}
                      onClick={connectGoogleFromEditor}
                      className="w-full rounded-lg border border-gray-300 py-2 text-xs font-bold text-gray-800 disabled:opacity-60"
                    >
                      {calendarBusy ? 'Opening Google...' : 'Connect Google Account'}
                    </button>
                  )}
                  <label className="block">
                    <span className="text-xs text-gray-500">Days to fetch</span>
                    <select
                      value={selected.props?.days || 1}
                      onChange={(e) => patchSelected({ props: { days: Number(e.target.value) } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                    >
                      <option value={1}>Today</option>
                      <option value={3}>Next 3 days</option>
                      <option value={7}>Next 7 days</option>
                    </select>
                  </label>
                  {error && selected?.type === 'calendar' ? (
                    <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-600">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={calendarBusy || !googleStatus.connected}
                    onClick={fetchGoogleCalendar}
                    className="w-full rounded-lg bg-brand py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {calendarBusy ? 'Fetching...' : 'Fetch Google meetings'}
                  </button>
                  {selected.props?.syncedAt ? (
                    <p className="text-[11px] text-gray-400">
                      Last sync: {new Date(selected.props.syncedAt).toLocaleString()}
                    </p>
                  ) : null}

                  {/* Named "events" rather than "schedule" so it is not confused with
                      the dayparting schedule that controls when a page plays. */}
                  <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Calendar events
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500">Title</span>
                    <input
                      value={selected.props?.title || ''}
                      onChange={(e) => patchSelected({ props: { title: e.target.value } })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                    />
                  </label>
                  {(selected.props?.items || []).map((item, index) => (
                    <div
                      key={`cal-${index}`}
                      className="grid grid-cols-[72px_1fr_auto] gap-1.5 [&>*]:min-w-0"
                    >
                      <input
                        value={item.time || ''}
                        onChange={(e) => {
                          const items = [...(selected.props?.items || [])]
                          items[index] = { ...items[index], time: e.target.value }
                          patchSelected({ props: { items } })
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="10:00"
                      />
                      <input
                        value={item.label || ''}
                        onChange={(e) => {
                          const items = [...(selected.props?.items || [])]
                          items[index] = { ...items[index], label: e.target.value }
                          patchSelected({ props: { items } })
                        }}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        placeholder="Event"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const items = (selected.props?.items || []).filter((_, i) => i !== index)
                          patchSelected({ props: { items } })
                        }}
                        className="rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const items = [
                        ...(selected.props?.items || []),
                        { time: '09:00', label: 'New event' },
                      ]
                      patchSelected({ props: { items } })
                    }}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-700"
                  >
                    + Add event
                  </button>
                </div>
              )}

              {selected.type === 'web' && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs text-gray-500">Website URL</span>
                    <input
                      value={selected.props?.url || ''}
                      onChange={(e) => patchSelected({ props: { url: e.target.value } })}
                      onBlur={(e) => {
                        let next = e.target.value.trim()
                        if (next && !/^https?:\/\//i.test(next)) {
                          next = `https://${next}`
                          patchSelected({ props: { url: next } })
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder="https://example.com"
                    />
                  </label>
                  <p className="text-[11px] leading-snug text-gray-500">
                    Most sites load through a secure proxy. Power BI / Fabric links load directly in
                    the iframe (proxy would break them). Use a Power BI &quot;Publish to web&quot; or
                    shareable embed URL if the report still shows unavailable.
                  </p>
                  {selected.props?.url ? (
                    <a
                      href={selected.props.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-semibold text-brand hover:underline"
                    >
                      Open in new tab
                    </a>
                  ) : null}
                </div>
              )}

              {(selected.type === 'image' || selected.type === 'video' || selected.type === 'pdf') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Media source
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-500">Direct URL</span>
                    <input
                      value={selected.props?.src || selected.props?.url || ''}
                      onChange={(e) => {
                        const ref = canonicalMediaRef(e.target.value)
                        patchSelected({ props: { src: ref, url: ref } })
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      placeholder={
                        selected.type === 'pdf'
                          ? 'https://…/file.pdf or Google Drive link'
                          : selected.type === 'video'
                            ? 'https://…/video.mp4'
                            : 'https://…/image.jpg'
                      }
                    />
                  </label>
                  {selected.type === 'pdf' ? (
                    <p className="text-[11px] leading-snug text-gray-500">
                      Use a direct link ending in <code className="font-mono">.pdf</code>, a Google
                      Drive file link, or upload the PDF in Media Library and pick it below. Generic
                      webpage links (SharePoint viewer pages, etc.) will not render.
                    </p>
                  ) : null}
                  {selected.type === 'image' ? (
                    <label className="block">
                      <span className="text-xs text-gray-500">Fit</span>
                      <select
                        value={selected.props?.fit || 'cover'}
                        onChange={(e) => patchSelected({ props: { fit: e.target.value } })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fill">Fill</option>
                      </select>
                    </label>
                  ) : null}

                  {selected.type === 'video' ? (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="text-xs text-gray-500">Playback</span>
                        <select
                          value={
                            selected.props?.playback === 'once' || selected.props?.loop === false
                              ? 'once'
                              : 'loop'
                          }
                          onChange={(e) => {
                            const once = e.target.value === 'once'
                            patchSelected({
                              props: {
                                playback: once ? 'once' : 'loop',
                                loop: !once,
                              },
                            })
                          }}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                        >
                          <option value="loop">Loop continuously</option>
                          <option value="once">Play once</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs text-gray-500">Fit</span>
                        <select
                          value={selected.props?.fit || 'cover'}
                          onChange={(e) => patchSelected({ props: { fit: e.target.value } })}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5"
                        >
                          <option value="cover">Cover</option>
                          <option value="contain">Contain</option>
                          <option value="fill">Fill</option>
                        </select>
                      </label>
                      <p className="text-[11px] leading-snug text-gray-500">
                        Use an <strong>MP4 (H.264)</strong> or <strong>WebM</strong> file. MOV often
                        will not play in Chrome / Android TV.
                      </p>
                    </div>
                  ) : null}

                  <div className="text-xs text-gray-500">Or pick from Media Library</div>
                  {library.length ? (
                    <div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto [&>*]:min-w-0">
                      {library
                        .filter((m) => {
                          if (selected.type === 'video') return m.type === 'video'
                          if (selected.type === 'pdf') return m.type === 'pdf'
                          return m.type === 'image'
                        })
                        .map((m) => {
                          const ref = canonicalMediaRef(m.url)
                          const current = canonicalMediaRef(
                            selected.props?.src || selected.props?.url || ''
                          )
                          const active = Boolean(ref) && current === ref
                          return (
                            <button
                              key={m._id}
                              type="button"
                              onClick={() =>
                                patchSelected({
                                  props: {
                                    src: ref,
                                    url: ref,
                                    title: m.name,
                                  },
                                })
                              }
                              className={`overflow-hidden rounded-lg border text-left ${
                                active ? 'border-brand ring-2 ring-brand/30' : 'border-gray-200'
                              }`}
                              title={m.name}
                            >
                              <div className="h-16 bg-gray-100">
                                {m.type === 'video' ? (
                                  <video
                                    src={resolveMediaUrl(m.url)}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                  />
                                ) : m.type === 'pdf' ? (
                                  <div className="grid h-full place-items-center bg-red-50 text-[10px] font-bold uppercase tracking-wide text-red-700">
                                    PDF
                                  </div>
                                ) : (
                                  <img
                                    src={resolveMediaUrl(m.url)}
                                    alt={m.name}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="truncate px-1.5 py-1 text-[10px] font-semibold text-gray-700">
                                {m.name}
                              </div>
                            </button>
                          )
                        })}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-gray-50 px-2 py-2 text-xs text-gray-500">
                      No media yet. Add files in Media Library first.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a widget to flip or edit its properties.</p>
          )}
        </aside>
      </div>

      {contextMenu ? (
        <div
          className="fixed z-[60] min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {contextMenu.type}
          </div>
          <button
            type="button"
            onClick={() => {
              const widget = page?.widgets?.find((w) => w.id === contextMenu.widgetId)
              if (!widget) return
              setSelectedId(widget.id)
              setContextMenu(null)
              editSelectedWidget()
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              const widget = page?.widgets?.find((w) => w.id === contextMenu.widgetId)
              if (!widget) return
              setContextMenu(null)
              duplicateWidget(widget)
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => {
              const widget = page?.widgets?.find((w) => w.id === contextMenu.widgetId)
              if (!widget) return
              setSelectedId(widget.id)
              const flipped = !widget.props?.flipH
              patchWidget(widget.id, { props: { flipH: flipped } })
              setContextMenu(null)
              setMessage(flipped ? 'Widget flipped horizontally' : 'Widget flip removed')
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            Flip horizontally
          </button>
          <button
            type="button"
            onClick={() => deleteWidget(contextMenu.widgetId)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Delete widget
          </button>
        </div>
      ) : null}

      {showUrlModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Web Search Display URL</h3>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <input
                readOnly
                value={playerUrl}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(playerUrl)}
                className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-semibold"
              >
                Copy
              </button>
              <a
                href={playerUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-brand px-2 py-1 text-xs font-semibold text-white"
              >
                Open
              </a>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Use this URL to view this display on any web browser / Android TV.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Open this address on one screen at a time.
            </p>
            <button
              type="button"
              onClick={() => setShowUrlModal(false)}
              className="mt-5 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pageToDelete)}
        title="Delete page"
        body={
          pageToDelete
            ? `Delete “${pageToDelete.name}”? Save the display afterward to keep this change.`
            : ''
        }
        confirmLabel="Delete page"
        danger
        onConfirm={confirmDeletePage}
        onClose={() => setPageToDelete(null)}
      />
    </div>
  )
}
