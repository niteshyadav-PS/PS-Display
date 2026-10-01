import { Link } from 'react-router-dom'
import { CheckIcon, CopyIcon, KeyIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons'
import logo from '../assets/header_logo.png'

export default function DisplayCard({
  display: d,
  team = false,
  busy = false,
  copied = false,
  onCopy,
  onPair,
  onRename,
  onDuplicate,
  onDelete,
  onTogglePlayback,
}) {
  return (
    <article
      className={`flex min-h-[200px] flex-col overflow-hidden rounded-2xl border bg-white transition ${
        busy ? 'opacity-60' : ''
      } ${
        d.playbackStopped
          ? 'border-slate-200 shadow-sm'
          : 'border-gray-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] hover:border-gray-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.08)]'
      }`}
    >
      <Link to={`/app/displays/${d._id}/edit`} className="flex min-w-0 flex-1 flex-col px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <img src={logo} alt="" className="h-8 w-auto max-w-[52%] object-contain object-left opacity-90" />
          <StatusBadge online={d.online} published={d.published} stopped={d.playbackStopped} />
        </div>

        <h3 className="mt-5 break-words text-[15px] font-semibold tracking-tight text-gray-900">{d.name}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          {team ? (
            <>
              {d.owner?.department || 'No department'}
              <span className="mx-1.5 text-gray-300">·</span>
            </>
          ) : d.department ? (
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
                d.scheduleActive ? 'bg-brand/15 text-[#3f6b14]' : 'bg-gray-100 text-gray-500'
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
            onClick={onTogglePlayback}
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
            onClick={onCopy}
            title="Copy player URL"
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
          <button
            type="button"
            onClick={onPair}
            title="Pairing code"
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            <KeyIcon size={13} />
          </button>
          <button
            type="button"
            onClick={onRename}
            title="Rename"
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            <PencilIcon size={13} />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate"
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            <PlusIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </article>
  )
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
