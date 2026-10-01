import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { displaysApi } from '../lib/api'
import { setNavDir } from '../lib/navTransition'
import UserAvatar from '../components/UserAvatar'
import GlobalSearch from '../components/GlobalSearch'
import logo from '../assets/Logo.png'
import {
  BellIcon,
  ChevronLeftIcon,
  CloseIcon,
  DashboardIcon,
  FolderIcon,
  GearIcon,
  LockIcon,
  LogoutIcon,
  MenuIcon,
  MonitorIcon,
  UsersIcon,
} from '../components/Icons'

function buildNotifications(displays = []) {
  const items = []
  const now = Date.now()

  displays.slice(0, 8).forEach((d) => {
    if (d.published) {
      items.push({
        id: `pub-${d._id}`,
        title: `${d.name} is live`,
        body: 'Display is published and ready to play.',
        time: d.updatedAt || d.createdAt,
        to: `/app/displays/${d._id}/edit`,
        unread: true,
      })
    } else if (d.status === 'Pending') {
      items.push({
        id: `pend-${d._id}`,
        title: `${d.name} needs publish`,
        body: 'Finish layout and publish to show on screen.',
        time: d.updatedAt || d.createdAt,
        to: `/app/displays/${d._id}/edit`,
        unread: true,
      })
    } else {
      items.push({
        id: `upd-${d._id}`,
        title: `${d.name} updated`,
        body: `${d.status || 'Active'} · ${d.pages?.length || 0} page(s)`,
        time: d.updatedAt || d.createdAt,
        to: `/app/displays/${d._id}/edit`,
        unread: true,
      })
    }
  })

  if (!items.length) {
    items.push({
      id: 'welcome',
      title: 'Welcome to Profile Solution',
      body: 'Create a display to start getting activity updates here.',
      time: new Date(now).toISOString(),
      to: '/app/displays/new',
      unread: true,
    })
  }

  return items.sort((a, b) => new Date(b.time) - new Date(a.time))
}

function formatNotifTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

const baseNav = [
  { to: '/app/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/app/displays', label: 'My Displays', icon: MonitorIcon },
  { to: '/app/media', label: 'Media Library', icon: FolderIcon },
  { to: '/app/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { to: '/app/settings', label: 'Settings', icon: GearIcon },
]

const titles = {
  '/app/dashboard': 'Dashboard',
  '/app/displays': 'My Displays',
  '/app/media': 'Media Library',
  '/app/users': 'Users',
  '/app/settings': 'Settings',
  '/app/displays/new': 'Create display',
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ps_notif_read') || '[]')
    } catch {
      return []
    }
  })
  const profileRef = useRef(null)
  const notifRef = useRef(null)

  const isAdmin = user?.role === 'Administrator'
  const nav = baseNav.filter((item) => !item.adminOnly || isAdmin)

  const visibleNotifications = useMemo(
    () =>
      notifications.map((n) => ({
        ...n,
        unread: n.unread && !readIds.includes(n.id),
      })),
    [notifications, readIds]
  )
  const unreadCount = visibleNotifications.filter((n) => n.unread).length

  useEffect(() => {
    const t = window.setTimeout(() => {
      document.documentElement.removeAttribute('data-nav-dir')
    }, 400)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  useEffect(() => {
    setMobileOpen(false)
    setProfileOpen(false)
    setNotifOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    let alive = true
    displaysApi
      .list()
      .then((data) => {
        if (alive) setNotifications(buildNotifications(data.displays || []))
      })
      .catch(() => {
        if (alive) setNotifications(buildNotifications([]))
      })
    return () => {
      alive = false
    }
  }, [location.pathname])

  useEffect(() => {
    function onDocClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    function onKey(e) {
      if (e.key !== 'Escape') return
      setProfileOpen(false)
      setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  function persistRead(ids) {
    setReadIds(ids)
    localStorage.setItem('ps_notif_read', JSON.stringify(ids))
  }

  function markAllRead() {
    const ids = Array.from(new Set([...readIds, ...notifications.map((n) => n.id)]))
    persistRead(ids)
  }

  function openNotification(item) {
    persistRead(Array.from(new Set([...readIds, item.id])))
    setNotifOpen(false)
    if (item.to) navigate(item.to)
  }

  function closeSidebar() {
    setMobileOpen(false)
    setDesktopOpen(false)
  }

  function goBack() {
    if (location.pathname === '/app/dashboard') return

    setNavDir('back')

    // Prefer one step in history; only use a parent route when there is nowhere to go back.
    if (window.history.state?.idx > 0) {
      navigate(-1, { viewTransition: true })
      return
    }

    const parents = {
      '/app/displays': '/app/dashboard',
      '/app/displays/new': '/app/displays',
      '/app/media': '/app/dashboard',
      '/app/users': '/app/dashboard',
      '/app/settings': '/app/dashboard',
    }

    navigate(parents[location.pathname] || '/app/dashboard', { viewTransition: true })
  }

  const title =
    titles[location.pathname] ||
    (location.pathname.startsWith('/app/displays/') ? 'Display' : 'Profile Solution')

  const showBack = location.pathname !== '/app/dashboard'

  const sidebar = (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-black/50 bg-[#14161a] px-3 py-5 shadow-[6px_0_28px_rgba(0,0,0,0.35)] sm:px-4">
      <div className="mb-6 flex shrink-0 items-center justify-between gap-2 px-1">
        <NavLink to="/app/dashboard" className="min-w-0 flex-1" onClick={() => setMobileOpen(false)}>
          <img
            src={logo}
            alt="Profile Solution"
            className="h-12 w-auto max-w-full object-contain object-left sm:h-14"
          />
        </NavLink>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          onClick={closeSidebar}
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand text-gray-900'
                  : 'text-white/55 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-3 shrink-0 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false)
            navigate('/app/settings')
          }}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/8"
          title="Open profile settings"
        >
          <UserAvatar user={user} size={36} ring={false} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user?.name || 'User'}</div>
            <div className="truncate text-xs text-white/45">{user?.role || 'Account'}</div>
          </div>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#f3f4f6]">
      {desktopOpen ? (
        <div className="hidden h-full shrink-0 lg:flex">{sidebar}</div>
      ) : null}

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close overlay"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 h-full shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#14161a] px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-6">
          <button
            type="button"
            className={`rounded-lg p-2 text-white/70 hover:bg-white/10 ${desktopOpen ? 'lg:hidden' : ''}`}
            onClick={() => {
              setMobileOpen(true)
              setDesktopOpen(true)
            }}
            aria-label="Open menu"
            title="Open sidebar"
          >
            <MenuIcon />
          </button>

          {showBack ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:gap-1.5 sm:px-3 sm:text-sm"
              aria-label="Go back"
              title="Go back"
            >
              <ChevronLeftIcon size={16} />
              <span className="hidden min-[380px]:inline">Back</span>
            </button>
          ) : null}

          <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold text-white sm:text-lg md:hidden">
            {title}
          </h1>
          <GlobalSearch isAdmin={isAdmin} className="hidden min-w-0 flex-1 md:block" />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v)
                  setProfileOpen(false)
                }}
                className="relative rounded-lg p-2 text-white/65 hover:bg-white/10"
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <BellIcon size={18} />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {notifOpen ? (
                <div className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1c1e24] shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-semibold text-white">Notifications</div>
                      <div className="text-xs text-white/45">
                        {unreadCount ? `${unreadCount} unread` : 'All caught up'}
                      </div>
                    </div>
                    {unreadCount ? (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {visibleNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openNotification(item)}
                        className={`flex w-full gap-3 border-b border-white/5 px-3 py-3 text-left transition hover:bg-white/6 ${
                          item.unread ? 'bg-white/4' : ''
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            item.unread ? 'bg-brand' : 'bg-white/20'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-white/55">
                            {item.body}
                          </span>
                          <span className="mt-1 block text-[11px] text-white/35">
                            {formatNotifTime(item.time)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-white/8"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <UserAvatar user={user} size={34} ring={false} />
                <div className="hidden text-left leading-tight sm:block">
                  <div className="text-sm font-semibold text-white">{user?.name || 'Admin'}</div>
                  <div className="text-xs text-white/45">{user?.role || 'User'}</div>
                </div>
              </button>

              {profileOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#1c1e24] shadow-xl"
                >
                  <div className="border-b border-white/10 px-3 py-2.5">
                    <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
                    <div className="truncate text-xs text-white/45">{user?.username || user?.role}</div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/app/settings?section=password')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/75 hover:bg-white/8"
                  >
                    <LockIcon size={16} />
                    Change password
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false)
                      logout()
                      navigate('/login')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-white/5"
                  >
                    <LogoutIcon size={16} />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f3f4f6] p-3 sm:p-5 lg:p-6">
          {/* Keyed so each route re-runs the enter animation; direction comes from
              the data-nav-dir attribute that BackButton / goBack set on <html>. */}
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
