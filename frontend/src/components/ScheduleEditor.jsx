import { DAY_LABELS, describeSchedule, toDateInput } from '../lib/schedule'

const PRESETS = [
  { id: 'always', label: 'Always on', value: { enabled: false } },
  {
    id: 'office',
    label: 'Office hours',
    value: { enabled: true, startTime: '09:00', endTime: '18:00', daysOfWeek: [1, 2, 3, 4, 5] },
  },
  {
    id: 'lunch',
    label: 'Lunch',
    value: { enabled: true, startTime: '11:30', endTime: '15:00', daysOfWeek: [1, 2, 3, 4, 5] },
  },
  {
    id: 'overnight',
    label: 'Overnight',
    value: { enabled: true, startTime: '22:00', endTime: '06:00', daysOfWeek: [] },
  },
]

const fieldClass =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand'

/**
 * Dayparting editor used for both whole displays and individual pages.
 */
export default function ScheduleEditor({ value, onChange, title = 'Schedule', compact = false }) {
  const schedule = value || {}
  const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : []

  function patch(changes) {
    onChange({ ...schedule, ...changes })
  }

  function toggleDay(day) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    patch({ daysOfWeek: next })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{title}</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(schedule.enabled)}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-brand"
          />
          Limit when this plays
        </label>
      </div>

      {!schedule.enabled ? (
        <p className="rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
          Plays whenever the screen is on.
        </p>
      ) : (
        <>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-gray-500">Days</div>
            <div className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, day) => {
                const on = days.includes(day)
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                      on
                        ? 'bg-brand text-white'
                        : 'border border-gray-200 bg-white text-gray-500 hover:border-brand/40'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {!days.length ? (
              <p className="mt-1 text-[11px] text-gray-400">No days selected = every day.</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500">From</span>
              <input
                type="time"
                value={schedule.startTime || ''}
                onChange={(e) => patch({ startTime: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500">To</span>
              <input
                type="time"
                value={schedule.endTime || ''}
                onChange={(e) => patch({ endTime: e.target.value })}
                className={fieldClass}
              />
            </label>
          </div>

          {!compact ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500">Start date</span>
                <input
                  type="date"
                  value={toDateInput(schedule.startDate)}
                  onChange={(e) => patch({ startDate: e.target.value || null })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500">End date</span>
                <input
                  type="date"
                  value={toDateInput(schedule.endDate)}
                  onChange={(e) => patch({ endDate: e.target.value || null })}
                  className={fieldClass}
                />
              </label>
            </div>
          ) : null}

          <p className="rounded-lg bg-brand/10 px-2.5 py-2 text-[11px] font-semibold text-gray-700">
            {describeSchedule(schedule)}
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-1 border-t border-gray-100 pt-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => patch({ ...preset.value })}
            className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:border-brand hover:text-gray-900"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
