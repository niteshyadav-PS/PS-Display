import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { displaysApi } from '../lib/api'
import { CheckIcon } from '../components/Icons'

const layouts = [
  { id: 'blank', label: 'Blank Layout', preview: 'blank' },
  { id: '1-column', label: '1 Column', preview: '1' },
  { id: '2-columns', label: '2 Columns', preview: '2' },
  { id: '3-columns', label: '3 Columns', preview: '3' },
  { id: 'header-content', label: 'Header + Content', preview: 'header' },
  { id: 'sidebar-content', label: 'Sidebar + Content', preview: 'sidebar' },
]

export default function CreateDisplay() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('My Display')
  const [layout, setLayout] = useState('blank')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const steps = useMemo(
    () => [
      { n: 1, label: 'Name Your Display', short: 'Name' },
      { n: 2, label: 'Choose Layout', short: 'Layout' },
    ],
    []
  )

  async function createDisplay() {
    try {
      setSaving(true)
      setError('')
      const { display } = await displaysApi.create({ name, deviceType: 'web', layout })
      navigate(`/app/displays/${display._id}/edit`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 sm:mb-8">
        {steps.map((s) => {
          const done = step > s.n
          const active = step === s.n
          return (
            <div
              key={s.n}
              className={`flex flex-1 items-center justify-center gap-2 px-2 py-3 text-xs font-semibold sm:justify-start sm:gap-3 sm:px-5 sm:py-4 sm:text-sm ${
                active || done ? 'bg-brand text-white' : 'bg-white text-gray-600'
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold sm:h-7 sm:w-7 sm:text-xs ${
                  active || done ? 'bg-white text-brand' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {done ? <CheckIcon size={12} /> : s.n}
              </span>
              <span className="hidden truncate sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.short}</span>
            </div>
          )
        })}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {step === 1 && (
        <div className="mx-auto flex max-w-lg flex-col items-center px-2 pt-10 sm:pt-16">
          <p className="mb-6 text-center text-sm text-gray-500 sm:mb-8 sm:text-base">
            Would you like to name the display?
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-8 w-full border-0 border-b border-gray-300 bg-transparent pb-2 text-center text-xl text-gray-900 outline-none placeholder:text-gray-400 sm:mb-10 sm:text-2xl"
            placeholder="HR Meeting Room"
          />
          <button
            type="button"
            onClick={() => name.trim() && setStep(2)}
            disabled={!name.trim()}
            className="w-full max-w-xs rounded-xl bg-brand px-10 py-3 text-sm font-bold tracking-wide text-white disabled:opacity-50 sm:w-auto sm:px-16"
          >
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mb-4 text-sm text-gray-500 sm:mb-5 sm:text-base">
            Choose a layout for your display
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {layouts.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayout(l.id)}
                className={`rounded-2xl bg-white p-4 text-left shadow-sm transition sm:p-5 ${
                  layout === l.id ? 'ring-2 ring-brand' : 'hover:ring-2 hover:ring-brand/40'
                }`}
              >
                <LayoutPreview type={l.preview} />
                <div className="mt-3 text-sm font-bold text-gray-900 sm:mt-4 sm:text-base">
                  {l.label}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:mt-8 sm:flex-row sm:gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-gray-300 px-8 py-3 text-sm font-bold tracking-wide text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={createDisplay}
              className="rounded-xl bg-brand px-8 py-3 text-sm font-bold tracking-wide text-white disabled:opacity-60"
            >
              {saving ? 'Creating...' : 'Create display'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LayoutPreview({ type }) {
  if (type === 'blank') {
    return <div className="h-24 rounded-lg border-2 border-dashed border-gray-200 sm:h-28" />
  }
  if (type === '1') {
    return (
      <div className="h-24 rounded-lg bg-gray-100 p-2 sm:h-28">
        <div className="h-full rounded bg-gray-300" />
      </div>
    )
  }
  if (type === '2') {
    return (
      <div className="flex h-24 gap-2 rounded-lg bg-gray-100 p-2 sm:h-28">
        <div className="flex-1 rounded bg-gray-300" />
        <div className="flex-1 rounded bg-gray-300" />
      </div>
    )
  }
  if (type === '3') {
    return (
      <div className="flex h-24 gap-2 rounded-lg bg-gray-100 p-2 sm:h-28">
        <div className="flex-1 rounded bg-gray-300" />
        <div className="flex-1 rounded bg-gray-300" />
        <div className="flex-1 rounded bg-gray-300" />
      </div>
    )
  }
  if (type === 'header') {
    return (
      <div className="flex h-24 flex-col gap-2 rounded-lg bg-gray-100 p-2 sm:h-28">
        <div className="h-5 rounded bg-gray-300 sm:h-6" />
        <div className="flex-1 rounded bg-gray-300" />
      </div>
    )
  }
  return (
    <div className="flex h-24 gap-2 rounded-lg bg-gray-100 p-2 sm:h-28">
      <div className="w-1/3 rounded bg-gray-300" />
      <div className="flex-1 rounded bg-gray-300" />
    </div>
  )
}
