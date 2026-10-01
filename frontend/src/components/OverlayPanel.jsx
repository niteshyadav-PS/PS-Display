import {
  OVERLAY_PRESETS,
  OVERLAY_SCHEDULE_MODES,
  normalizeOverlay,
  overlayPreviewLabel,
} from '../lib/pageVisuals'
import { CloseIcon } from './Icons'

function OverlayIconGrid({ value, onSelect }) {
  const activeId = value || 'none'
  const events = OVERLAY_PRESETS.filter((p) => p.group === 'event' || p.group === 'off')
  const moods = OVERLAY_PRESETS.filter((p) => p.group === 'mood')

  function renderGroup(title, presets) {
    return (
      <div className="mb-3">
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map((preset) => {
            const active = activeId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                onClick={() => onSelect(preset.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                  active
                    ? 'border-brand bg-brand/15 shadow-sm ring-2 ring-brand/25'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-lg"
                  style={{ backgroundColor: `${preset.tint}22` }}
                >
                  {preset.icon}
                </span>
                <span
                  className={`max-w-full truncate text-[10px] font-semibold ${
                    active ? 'text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {preset.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {renderGroup('Events', events)}
      {renderGroup('Mood', moods)}
    </>
  )
}

/** Shared controls for message, strength, and schedule. */
export function OverlaySettingsForm({ overlay, onChange }) {
  const cfg = normalizeOverlay(overlay)

  return (
    <div className="space-y-2">
      {cfg.type !== 'none' ? (
        <>
          <label className="block">
            <span className="text-xs text-gray-500">Banner message</span>
            <input
              value={cfg.message}
              onChange={(e) => onChange({ message: e.target.value })}
              placeholder="e.g. Happy Birthday Ashish!"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">
              Strength ({Math.round(cfg.opacity * 100)}%)
            </span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={cfg.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">When to show</span>
            <select
              value={cfg.scheduleMode}
              onChange={(e) => onChange({ scheduleMode: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            >
              {OVERLAY_SCHEDULE_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          {cfg.scheduleMode === 'range' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">From</span>
                <input
                  type="date"
                  value={cfg.startDate}
                  onChange={(e) => onChange({ startDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">To</span>
                <input
                  type="date"
                  value={cfg.endDate}
                  onChange={(e) => onChange({ endDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                />
              </label>
            </div>
          ) : null}
          {cfg.scheduleMode === 'annual' ? (
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">Month</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={cfg.month}
                  onChange={(e) => onChange({ month: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Day</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={cfg.day}
                  onChange={(e) => onChange({ day: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Days before</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={cfg.daysBefore}
                  onChange={(e) => onChange({ daysBefore: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                />
              </label>
            </div>
          ) : null}
          <p className="text-[11px] text-gray-500">
            Live screen: {overlayPreviewLabel(cfg)}. Editor always previews.
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-500">Pick an event or mood overlay above.</p>
      )}
    </div>
  )
}

/** Floating panel opened from the page toolbar Overlays button. */
export default function OverlayPanel({ overlay, onChange, onClose }) {
  const active = OVERLAY_PRESETS.find((p) => p.id === (overlay?.type || 'none')) || OVERLAY_PRESETS[0]

  return (
    <div
      className="absolute right-4 top-4 z-30 w-[min(20rem,92vw)] max-h-[min(28rem,70vh)] overflow-auto rounded-2xl border border-black/5 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.2)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base"
            style={{ backgroundColor: `${active.tint}22` }}
          >
            {active.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Overlays</p>
            <p className="truncate text-[11px] text-gray-500">{active.label}</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          onClick={onClose}
          aria-label="Close overlays"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <OverlayIconGrid
        value={overlay?.type}
        onSelect={(type) => onChange({ type })}
      />

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
        <OverlaySettingsForm overlay={overlay} onChange={onChange} />
      </div>
    </div>
  )
}

export { OverlayIconGrid }
