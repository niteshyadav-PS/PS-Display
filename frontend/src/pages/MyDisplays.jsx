import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { displaysApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import DisplayCard from '../components/DisplayCard'
import Modal from '../components/Modal'
import {
  CheckIcon,
  CopyIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '../components/Icons'
import logo from '../assets/header_logo.png'

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'Active', label: 'Active' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Inactive', label: 'Inactive' },
]

const ONLINE_FILTERS = [
  { id: '', label: 'Any' },
  { id: 'true', label: 'Online' },
  { id: 'false', label: 'Offline' },
]

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function StatusBadge({ online, published, stopped }) {
  if (!published) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Draft
      </span>
    )
  }
  if (stopped) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Stopped
      </span>
    )
  }
  if (online) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Offline
    </span>
  )
}

export default function MyDisplays() {
  const { user, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [displays, setDisplays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [status, setStatus] = useState(() => searchParams.get('status') || '')
  const [online, setOnline] = useState(() => searchParams.get('online') || '')
  const [busyId, setBusyId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [pairing, setPairing] = useState(null)
  const [copiedId, setCopiedId] = useState('')
  const navigate = useNavigate()

  const debouncedSearch = useDebounced(search)

  // Keep filters in sync when arriving from dashboard search / KPI links.
  useEffect(() => {
    const nextSearch = searchParams.get('search') || ''
    const nextStatus = searchParams.get('status') || ''
    const nextOnline = searchParams.get('online') || ''
    setSearch((prev) => (prev === nextSearch ? prev : nextSearch))
    setStatus((prev) => (prev === nextStatus ? prev : nextStatus))
    setOnline((prev) => (prev === nextOnline ? prev : nextOnline))
  }, [searchParams])

  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedSearch) next.set('search', debouncedSearch)
    if (status) next.set('status', status)
    if (online) next.set('online', online)
    const current = searchParams.toString()
    const upcoming = next.toString()
    if (current !== upcoming) setSearchParams(next, { replace: true })
  }, [debouncedSearch, status, online, searchParams, setSearchParams])

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true)
      try {
        const data = await displaysApi.list({ search: debouncedSearch, status, online })
        setDisplays(data.displays)
        setError('')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [debouncedSearch, status, online]
  )

  useEffect(() => {
    load()
  }, [load])

  // Keep online badges fresh without a full page reload.
  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), 30000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const filtersActive = Boolean(debouncedSearch || status || online)

  const summary = useMemo(() => {
    const total = displays.length
    const live = displays.filter((d) => d.online).length
    return { total, live }
  }, [displays])

  const ownDisplays = useMemo(() => {
    if (!isAdmin) return displays
    return displays.filter((d) => String(d.createdBy) === String(user?.id))
  }, [displays, isAdmin, user?.id])

  const userGroups = useMemo(() => {
    if (!isAdmin) return []
    const groups = new Map()
    for (const display of displays) {
      if (String(display.createdBy) === String(user?.id)) continue
      if (!display.owner?.id) continue
      const key = String(display.owner?.id || display.createdBy || 'unknown')
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: display.owner.name,
          department: display.owner?.department || '',
          items: [],
        })
      }
      groups.get(key).items.push(display)
    }
    return [...groups.values()]
  }, [displays, isAdmin, user?.id])

  async function run(id, action, successMessage) {
    setBusyId(id)
    try {
      await action()
      setNotice(successMessage)
      await load({ quiet: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function copyPlayerUrl(display) {
    try {
      await navigator.clipboard.writeText(display.playerUrl)
      setCopiedId(display._id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch {
      setError('Could not copy the player URL')
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Displays"
        description={
          loading
            ? 'Loading your screens...'
            : `${summary.total} screen${summary.total === 1 ? '' : 's'} · ${summary.live} online`
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, location, or code"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label ? `Status: ${f.label}` : f.label}
            </option>
          ))}
        </select>

        <select
          value={online}
          onChange={(e) => setOnline(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
          aria-label="Filter by connection"
        >
          {ONLINE_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {`Screen: ${f.label}`}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-brand"
          title="Refresh"
        >
          <RefreshIcon size={15} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error ? (
        <p className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          <button type="button" onClick={() => setError('')} className="font-bold">
            ×
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {notice}
        </p>
      ) : null}

      {isAdmin ? <h3 className="mb-3 text-lg font-bold text-gray-900">Your displays</h3> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate('/app/displays/new')}
          className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-6 text-center transition hover:border-brand hover:bg-brand/[0.04]"
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#121212] text-white transition group-hover:bg-brand">
            <PlusIcon size={22} />
          </span>
          <div>
            <span className="block text-sm font-bold text-gray-900">New display</span>
            <span className="mt-0.5 block text-xs text-gray-500">Create a screen layout</span>
          </div>
        </button>

        {(isAdmin ? ownDisplays : displays).map((d) => (
          <article
            key={d._id}
            className={`flex min-h-[200px] flex-col overflow-hidden rounded-2xl border bg-white transition ${
              busyId === d._id ? 'opacity-60' : ''
            } ${
              d.playbackStopped
                ? 'border-slate-200 shadow-sm'
                : 'border-gray-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] hover:border-gray-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.08)]'
            }`}
          >
            <Link
              to={`/app/displays/${d._id}/edit`}
              className="flex min-w-0 flex-1 flex-col px-4 pb-3 pt-4"
            >
              <div className="flex items-start justify-between gap-3">
                <img
                  src={logo}
                  alt=""
                  className="h-8 w-auto max-w-[52%] object-contain object-left opacity-90"
                />
                <StatusBadge
                  online={d.online}
                  published={d.published}
                  stopped={d.playbackStopped}
                />
              </div>

              <h3 className="mt-5 break-words text-[15px] font-semibold tracking-tight text-gray-900">
                {d.name}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                {d.department ? (
                  <>
                    {d.department}
                    <span className="mx-1.5 text-gray-300">·</span>
                  </>
                ) : null}
                {d.pages?.length || 1} page{(d.pages?.length || 1) === 1 ? '' : 's'}
                <span className="mx-1.5 text-gray-300">·</span>
                {d.location || 'No location'}
              </p>

              {d.schedule?.enabled ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      d.scheduleActive
                        ? 'bg-brand/15 text-[#3f6b14]'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                    title={d.scheduleLabel}
                  >
                    {d.scheduleActive ? 'On schedule' : 'Off schedule'}
                  </span>
                </div>
              ) : null}
            </Link>

            <div className="mt-auto flex items-center gap-2 border-t border-gray-100 bg-[#fafafa] px-3 py-2.5">
              {d.published ? (
                <button
                  type="button"
                  onClick={() =>
                    run(
                      d._id,
                      () =>
                        d.playbackStopped
                          ? displaysApi.resume(d._id)
                          : displaysApi.stop(d._id),
                      d.playbackStopped ? 'Display resumed' : 'Display stopped on screen'
                    )
                  }
                  title={d.playbackStopped ? 'Resume display' : 'Stop display on screen'}
                  className={`h-8 shrink-0 rounded-lg px-3 text-[11px] font-semibold transition ${
                    d.playbackStopped
                      ? 'bg-brand text-white hover:brightness-105'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {d.playbackStopped ? 'Resume' : 'Stop'}
                </button>
              ) : (
                <Link
                  to={`/app/displays/${d._id}/edit`}
                  className="grid h-8 place-items-center rounded-lg bg-[#121212] px-3 text-[11px] font-semibold text-white hover:bg-brand"
                >
                  Edit
                </Link>
              )}

              <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-white p-0.5 ring-1 ring-gray-200/80">
                <button
                  type="button"
                  onClick={() => copyPlayerUrl(d)}
                  title="Copy player URL"
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  {copiedId === d._id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setPairing(d)}
                  title="Pairing code"
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  <KeyIcon size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(d)
                    setRenameValue(d.name)
                  }}
                  title="Rename"
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  <PencilIcon size={13} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(d._id, () => displaysApi.duplicate(d._id), 'Display duplicated')
                  }
                  title="Duplicate"
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  <PlusIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(d)}
                  title="Delete"
                  className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}

        {!loading && (isAdmin ? ownDisplays : displays).length === 0 && userGroups.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500">
            {filtersActive
              ? 'No displays match those filters.'
              : 'No displays yet. Create your first one to get started.'}
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <section className="mt-10">
          <h3 className="text-lg font-bold text-gray-900">User displays</h3>
          <p className="mt-1 text-sm text-gray-500">Screens created by your team, grouped by person.</p>
          {userGroups.length ? (
            userGroups.map((group) => (
              <div key={group.key} className="mt-6">
                <div className="mb-3">
                  <h4 className="font-semibold text-gray-900">{group.name}</h4>
                  <p className="text-sm text-gray-500">{group.department || 'No department'}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((d) => (
                    <DisplayCard
                      key={d._id}
                      display={d}
                      team
                      busy={busyId === d._id}
                      copied={copiedId === d._id}
                      onCopy={() => copyPlayerUrl(d)}
                      onPair={() => setPairing(d)}
                      onRename={() => {
                        setRenaming(d)
                        setRenameValue(d.name)
                      }}
                      onDuplicate={() => run(d._id, () => displaysApi.duplicate(d._id), 'Display duplicated')}
                      onDelete={() => setConfirmDelete(d)}
                      onTogglePlayback={() =>
                        run(
                          d._id,
                          () => (d.playbackStopped ? displaysApi.resume(d._id) : displaysApi.stop(d._id)),
                          d.playbackStopped ? 'Display resumed' : 'Display stopped on screen'
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          ) : !filtersActive ? (
            <p className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
              No displays created by users yet.
            </p>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete display"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                run(target._id, () => displaysApi.remove(target._id), 'Display deleted')
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Delete <strong className="text-gray-900">{confirmDelete?.name}</strong> permanently? Any
          screen currently showing it will stop playing. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename display"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRenaming(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!renameValue.trim()}
              onKeyDown={(e) => {
                if (e.key === ' ') e.preventDefault()
              }}
              onClick={() => {
                const target = renaming
                const name = renameValue.trim()
                setRenaming(null)
                run(target._id, () => displaysApi.update(target._id, { name }), 'Display renamed')
              }}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-700">Display name</span>
          <textarea
            name="display-name"
            autoComplete="off"
            rows={2}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand"
            placeholder="For example: HR Meeting Room"
          />
          <span className="mt-1.5 block text-xs text-gray-500">Use as many words as you need.</span>
        </label>
      </Modal>

      <Modal
        open={Boolean(pairing)}
        onClose={() => setPairing(null)}
        title="Pair a screen"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                const target = pairing
                setPairing(null)
                run(target._id, () => displaysApi.resetCode(target._id), 'New pairing code issued')
              }}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              New code
            </button>
            <button
              type="button"
              onClick={() => setPairing(null)}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white"
            >
              Done
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Open the player on your TV and enter this code, or load the player URL directly.
          </p>
          <div className="rounded-xl bg-gray-900 px-4 py-5 text-center">
            <div className="font-mono text-3xl font-bold tracking-[0.25em] text-brand">
              {pairing?.deviceCode}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Player URL</span>
            <div className="flex gap-2">
              <input
                readOnly
                value={pairing?.playerUrl || ''}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => pairing && copyPlayerUrl(pairing)}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700"
              >
                {copiedId === pairing?._id ? 'Copied' : 'Copy'}
              </button>
            </div>
          </label>
          <p className="text-xs text-gray-500">
            {pairing?.paired
              ? 'This display is paired.'
              : 'Not paired yet — the code stays valid until you issue a new one.'}
          </p>
        </div>
      </Modal>
    </div>
  )
}
