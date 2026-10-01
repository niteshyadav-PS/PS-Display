import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { dashboardApi } from '../lib/api'
import UserAvatar from '../components/UserAvatar'
import {
  ActivityIcon,
  CalendarIcon,
  ClockIcon,
  MonitorIcon,
  RefreshIcon,
  UsersIcon,
} from '../components/Icons'

const cardClass =
  'rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:p-5'
const clickableCardClass = `${cardClass} cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setRefreshing(true)
    try {
      setStats(await dashboardApi.stats())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function go(path) {
    if (path) navigate(path)
  }

  const teamPath = isAdmin ? '/app/users' : '/app/settings'

  /** KPI tiles built from real counts, with an honest secondary line instead of a fake trend. */
  const kpis = useMemo(() => {
    if (!stats) return []
    const k = stats.kpis

    return [
      {
        key: 'displays',
        label: 'Total Displays',
        value: k.totalDisplays,
        detail: `${k.published} published`,
        Icon: MonitorIcon,
        to: '/app/displays',
      },
      {
        key: 'online',
        label: 'Screens Online',
        value: k.online,
        detail: k.offline ? `${k.offline} offline` : 'All published screens live',
        tone: k.offline ? 'warn' : 'good',
        Icon: ActivityIcon,
        to: '/app/displays?online=true',
      },
      {
        key: 'content',
        label: 'Pages & Widgets',
        value: k.pages,
        detail: `${k.widgets} widget${k.widgets === 1 ? '' : 's'} placed`,
        Icon: CalendarIcon,
        to: '/app/displays',
      },
      {
        key: 'team',
        label: isAdmin ? 'Team Members' : 'Scheduled',
        value: isAdmin ? k.teamMembers : k.scheduled,
        detail: isAdmin
          ? k.openRequests
            ? `${k.openRequests} open request${k.openRequests === 1 ? '' : 's'}`
            : 'No open requests'
          : 'displays with dayparting',
        Icon: isAdmin ? UsersIcon : ClockIcon,
        to: isAdmin ? '/app/users' : '/app/displays',
      },
    ]
  }, [stats, isAdmin])

  if (error && !stats) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
        <button type="button" onClick={load} className="ml-3 font-bold underline">
          Retry
        </button>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-7xl space-y-5" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-white" />
      </div>
    )
  }

  const hasActivity = stats.activity.some((d) => d.created || d.updated)

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Here&apos;s the current
            state of your screens.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-brand/40 hover:bg-brand/5 disabled:opacity-60"
        >
          <RefreshIcon size={15} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" onClick={() => go(kpi.to)} className={clickableCardClass}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-500">{kpi.label}</div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-gray-800">
                <kpi.Icon size={18} />
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 sm:text-3xl">{kpi.value}</div>
            <div
              className={`mt-2 text-xs font-semibold ${
                kpi.tone === 'warn'
                  ? 'text-amber-600'
                  : kpi.tone === 'good'
                    ? 'text-brand'
                    : 'text-gray-500'
              }`}
            >
              {kpi.detail}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <button type="button" onClick={() => go('/app/displays')} className={clickableCardClass}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-gray-900">Display Activity (last 7 days)</h3>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-brand" /> Created
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-purple-500" /> Updated
              </span>
            </div>
          </div>

          {hasActivity ? (
            <div className="pointer-events-none h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={28} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="created" stroke="#8bc53f" fill="#8bc53f33" />
                  <Area type="monotone" dataKey="updated" stroke="#8b5cf6" fill="#8b5cf633" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-52 place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 sm:h-64">
              No display changes in the last 7 days.
            </div>
          )}
          <p className="mt-3 text-xs font-semibold text-brand">Open My Displays →</p>
        </button>

        <button type="button" onClick={() => go('/app/displays')} className={clickableCardClass}>
          <h3 className="mb-4 font-bold text-gray-900">Displays by Location</h3>

          {stats.usage.length ? (
            <>
              <div className="flex flex-col items-center gap-4 min-[420px]:flex-row">
                <div className="pointer-events-none h-40 w-40 shrink-0 sm:h-44 sm:w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.usage} dataKey="value" innerRadius={42} outerRadius={68}>
                        {stats.usage.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {stats.usage.map((u) => (
                    <li
                      key={u.name}
                      className="flex items-center justify-between gap-4 text-gray-700"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <i
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: u.color }}
                        />
                        <span className="truncate">{u.name}</span>
                      </span>
                      <strong className="shrink-0">{u.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 text-center text-sm font-semibold text-gray-800">
                {stats.kpis.totalDisplays} Total · Manage displays →
              </p>
            </>
          ) : (
            <div className="grid h-44 place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
              Create a display to see this breakdown.
            </div>
          )}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Recent Displays</h3>
            <Link to="/app/displays" className="text-sm font-semibold text-brand hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentDisplays.length ? (
              stats.recentDisplays.map((d) => (
                <button
                  key={d._id}
                  type="button"
                  onClick={() => go(`/app/displays/${d._id}/edit`)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-brand/10"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">{d.name}</div>
                    <div className="text-gray-500">
                      {isAdmin && d.owner?.name ? `${d.owner.name} · ` : ''}
                      {d.location || 'No location'} · {d.pages?.length || 1} page(s)
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      d.online
                        ? 'bg-brand/20 text-green-800'
                        : d.published
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <i
                      className={`h-1.5 w-1.5 rounded-full ${
                        d.online ? 'bg-green-500' : d.published ? 'bg-amber-500' : 'bg-gray-400'
                      }`}
                    />
                    {d.online ? 'Online' : d.published ? 'Offline' : 'Draft'}
                  </span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => go('/app/displays/new')}
                className="w-full rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm font-semibold text-gray-500 transition hover:border-brand hover:bg-brand/5 hover:text-gray-800"
              >
                No displays yet — create one
              </button>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Team Members</h3>
            <Link to={teamPath} className="text-sm font-semibold text-brand hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-2">
            {stats.team.map((m) => (
              <div
                key={m.id}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm"
              >
                <button
                  type="button"
                  onClick={() => go(teamPath)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left transition hover:bg-brand/10"
                >
                  <UserAvatar user={m} size={32} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">{m.name}</div>
                    <div className="text-gray-500">{m.role}</div>
                  </div>
                </button>
                <div className="min-w-0 max-w-[45%] text-right">
                  {m.displays?.length ? (
                    m.displays.map((display) => (
                      <Link
                        key={display.id}
                        to={`/app/displays/${display.id}/edit`}
                        className="block truncate text-xs font-semibold text-brand hover:underline"
                      >
                        {display.name}
                      </Link>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No displays</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardClass} lg:col-span-2 xl:col-span-1`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Most Used Widgets</h3>
            <Link to="/app/media" className="text-sm font-semibold text-brand hover:underline">
              Media
            </Link>
          </div>

          {stats.topWidgets.length ? (
            <div className="space-y-2">
              {stats.topWidgets.map((w) => {
                const max = stats.topWidgets[0].uses || 1
                return (
                  <div key={w.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-gray-900">{w.name}</span>
                      <span className="text-gray-500">
                        {w.uses} use{w.uses === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((w.uses / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
              Add widgets to a display to see this.
            </p>
          )}

          <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
            Media library: <strong className="text-gray-800">{stats.media.count} file(s)</strong> ·{' '}
            {formatBytes(stats.media.bytes)}
          </p>
        </div>
      </div>
    </div>
  )
}
