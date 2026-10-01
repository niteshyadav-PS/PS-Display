import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, displaysApi, mediaApi } from '../lib/api'
import {
  DashboardIcon,
  FolderIcon,
  GearIcon,
  MonitorIcon,
  SearchIcon,
  UsersIcon,
} from './Icons'

const NAV_TARGETS = [
  { id: 'nav-dashboard', label: 'Dashboard', hint: 'Overview & stats', to: '/app/dashboard', Icon: DashboardIcon },
  { id: 'nav-displays', label: 'My Displays', hint: 'Manage screens', to: '/app/displays', Icon: MonitorIcon },
  { id: 'nav-media', label: 'Media Library', hint: 'Images, videos, PDFs', to: '/app/media', Icon: FolderIcon },
  { id: 'nav-settings', label: 'Settings', hint: 'Profile & preferences', to: '/app/settings', Icon: GearIcon },
]

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * Header search for the dashboard (and reusable elsewhere).
 * Searches displays, media, users (admins), and main nav pages.
 */
export default function GlobalSearch({ isAdmin = false, className = '' }) {
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [displays, setDisplays] = useState([])
  const [media, setMedia] = useState([])
  const [users, setUsers] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)

  const debounced = useDebounced(query.trim())

  useEffect(() => {
    if (!debounced) {
      setDisplays([])
      setMedia([])
      setUsers([])
      setLoading(false)
      return undefined
    }

    let alive = true
    setLoading(true)

    const jobs = [
      displaysApi.list({ search: debounced }).then((data) => {
        if (alive) setDisplays((data.displays || []).slice(0, 6))
      }),
      mediaApi.list({ search: debounced }).then((data) => {
        if (alive) setMedia((data.media || []).slice(0, 4))
      }),
    ]

    if (isAdmin) {
      jobs.push(
        authApi.listUsers().then((data) => {
          if (!alive) return
          const q = debounced.toLowerCase()
          setUsers(
            (data.users || [])
              .filter(
                (u) =>
                  u.name?.toLowerCase().includes(q) ||
                  u.username?.toLowerCase().includes(q) ||
                  u.email?.toLowerCase().includes(q) ||
                  u.department?.toLowerCase().includes(q) ||
                  u.role?.toLowerCase().includes(q)
              )
              .slice(0, 4)
          )
        })
      )
    }

    Promise.allSettled(jobs).finally(() => {
      if (alive) setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [debounced, isAdmin])

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const results = useMemo(() => {
    const q = debounced.toLowerCase()
    const items = []

    if (q) {
      for (const page of NAV_TARGETS) {
        if (
          page.label.toLowerCase().includes(q) ||
          page.hint.toLowerCase().includes(q)
        ) {
          items.push({
            id: page.id,
            kind: 'Page',
            label: page.label,
            hint: page.hint,
            to: page.to,
            Icon: page.Icon,
          })
        }
      }

      if (isAdmin && (q.includes('user') || q.includes('team'))) {
        items.push({
          id: 'nav-users',
          kind: 'Page',
          label: 'Users',
          hint: 'Team accounts and departments',
          to: '/app/users',
          Icon: UsersIcon,
        })
      }
    }

    for (const d of displays) {
      items.push({
        id: `display-${d._id}`,
        kind: 'Display',
        label: d.name,
        hint: [d.location, d.published ? 'Live' : d.status]
          .filter(Boolean)
          .join(' · '),
        to: `/app/displays/${d._id}/edit`,
        Icon: MonitorIcon,
      })
    }

    for (const m of media) {
      items.push({
        id: `media-${m._id}`,
        kind: 'Media',
        label: m.name,
        hint: m.type,
        to: '/app/media',
        Icon: FolderIcon,
      })
    }

    for (const u of users) {
      items.push({
        id: `user-${u.id || u._id}`,
        kind: 'User',
        label: u.name,
        hint: u.email || u.role,
        to: '/app/users',
        Icon: UsersIcon,
      })
    }

    return items
  }, [debounced, displays, media, users, isAdmin])

  useEffect(() => {
    setActiveIndex(0)
  }, [results])

  function goTo(item) {
    if (!item) return
    setOpen(false)
    setQuery('')
    navigate(item.to)
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter') && query.trim()) {
      setOpen(true)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[activeIndex]) goTo(results[activeIndex])
      else if (query.trim()) navigate(`/app/displays?search=${encodeURIComponent(query.trim())}`)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div ref={rootRef} className={`relative mx-auto w-full max-w-xl ${className}`}>
      <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-white/70 transition focus-within:border-brand/50 focus-within:bg-white/12">
        <SearchIcon size={16} className="shrink-0 text-white/45" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search displays, media, pages..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          aria-label="Search"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          autoComplete="off"
          spellCheck="false"
        />
        {loading ? (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setOpen(false)
              inputRef.current?.focus()
            }}
            className="text-xs font-semibold text-white/45 hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </label>

      {showPanel ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-auto rounded-xl border border-white/10 bg-[#1c1e24] py-1 shadow-xl"
        >
          {results.length ? (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => goTo(item)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  index === activeIndex ? 'bg-white/8' : 'hover:bg-white/5'
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/8 text-white/70">
                  <item.Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
                  <span className="block truncate text-xs text-white/45">{item.hint}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/45">
                  {item.kind}
                </span>
              </button>
            ))
          ) : loading ? (
            <div className="px-3 py-4 text-center text-sm text-white/45">Searching...</div>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-white/45">
              No matches for &ldquo;{query.trim()}&rdquo;
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(`/app/displays?search=${encodeURIComponent(query.trim())}`)
                  setQuery('')
                }}
                className="mt-2 block w-full text-xs font-semibold text-brand hover:underline"
              >
                Search in My Displays →
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
