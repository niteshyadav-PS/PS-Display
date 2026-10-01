import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaApi, resolveMediaUrl } from '../lib/api'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { CheckIcon, ImageIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons'

const TYPE_FILTERS = [
  { id: '', label: 'All files' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'pdf', label: 'PDFs' },
]

function guessType(url) {
  if (/\.(mp4|webm|ogg|ogv|mov)(\?|$)/i.test(url)) return 'video'
  if (/\.pdf(\?|$)/i.test(url)) return 'pdf'
  return 'image'
}

function formatBytes(bytes) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function MediaThumb({ item }) {
  const [failed, setFailed] = useState(false)
  const src = resolveMediaUrl(item.url)

  if (item.type === 'pdf') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 bg-gray-100 px-3 text-center text-gray-500">
        <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
          PDF
        </span>
        <span className="line-clamp-2 text-[11px] leading-snug text-gray-600">{item.name}</span>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 bg-gray-100 px-3 text-center text-gray-400">
        <ImageIcon size={28} />
        <span className="text-[11px] leading-snug">
          Could not load. Upload a file from your PC instead of a webpage link.
        </span>
      </div>
    )
  }

  if (item.type === 'video') {
    return (
      <video
        src={src}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <img
      src={src}
      alt={item.name}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export default function MediaLibrary() {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [linkName, setLinkName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('image')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteUsage, setDeleteUsage] = useState([])
  const [checkingUsage, setCheckingUsage] = useState(false)
  const fileRef = useRef(null)

  const debouncedSearch = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mediaApi.list({ search: debouncedSearch, type: typeFilter })
      setMedia(data.media)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, typeFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  async function addMedia(e) {
    e.preventDefault()
    setError('')
    try {
      await mediaApi.create({ name: linkName, url, type: type || guessType(url) })
      setLinkName('')
      setUrl('')
      setType('image')
      setNotice('Link added to the library')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      await mediaApi.upload(file, uploadName || file.name)
      setUploadName('')
      setNotice(`${file.name} uploaded`)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function copyUrl(item) {
    try {
      await navigator.clipboard.writeText(resolveMediaUrl(item.url))
      setCopiedId(item._id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch {
      setError('Could not copy URL')
    }
  }

  /** Check where a file is used before offering to delete it. */
  async function askDelete(item) {
    setDeleteTarget(item)
    setDeleteUsage([])
    setCheckingUsage(true)
    try {
      const data = await mediaApi.usage(item._id)
      setDeleteUsage(data.usedBy || [])
    } catch {
      setDeleteUsage([])
    } finally {
      setCheckingUsage(false)
    }
  }

  async function confirmDelete() {
    const item = deleteTarget
    setDeleteTarget(null)
    try {
      await mediaApi.remove(item._id, { force: true })
      setNotice('File deleted')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <PageHeader
        title="Media library"
        description="Upload images, videos, and PDFs, then place them on display widgets."
      />
      <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">

        <div className="mb-4 flex flex-wrap gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,application/pdf,.pdf"
            className="hidden"
            onChange={onUpload}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <PlusIcon size={16} />
            {uploading ? 'Uploading...' : 'Upload from PC'}
          </button>
          <input
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder="Optional name for the upload"
            className="min-w-[200px] flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <form
          onSubmit={addMedia}
          className="grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-[1fr_1.3fr_auto_auto]"
        >
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Asset name (for URL)"
            required
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setType(guessType(e.target.value))
            }}
            placeholder="Or paste direct file URL (.jpg / .mp4 / .pdf)"
            required
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-800"
          >
            Add URL
          </button>
        </form>

        {error ? (
          <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
            <button type="button" onClick={() => setError('')} className="font-bold">
              ×
            </button>
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files by name"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                typeFilter === f.id ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {media.map((item) => (
          <div
            key={item._id}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="relative h-40 bg-gray-50">
              <MediaThumb item={item} />
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {item.type}
              </span>
              {item.size ? (
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {formatBytes(item.size)}
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">{item.name}</div>
                <div className="truncate text-xs text-gray-500">{resolveMediaUrl(item.url)}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => copyUrl(item)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  {copiedId === item._id ? (
                    <>
                      <CheckIcon size={12} /> Copied
                    </>
                  ) : (
                    'Copy URL'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => askDelete(item)}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-red-500 hover:underline"
                >
                  <TrashIcon size={13} /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && !media.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            {search || typeFilter
              ? 'No files match that search.'
              : 'No media yet. Upload an image, video, or PDF from your PC to get started.'}
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete file"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={checkingUsage}
              onClick={confirmDelete}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {deleteUsage.length ? 'Delete anyway' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Delete <strong className="text-gray-900">{deleteTarget?.name}</strong>?
          </p>

          {checkingUsage ? (
            <p className="text-xs text-gray-500">Checking which displays use this file...</p>
          ) : deleteUsage.length ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <strong className="block">
                In use by {deleteUsage.length} display{deleteUsage.length === 1 ? '' : 's'}:
              </strong>
              <ul className="mt-1 list-inside list-disc">
                {deleteUsage.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
              <span className="mt-1.5 block">
                Those screens will show a blank widget until you pick a new file.
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-500">This file is not used by any display.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
