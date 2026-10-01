import { useEffect, useRef } from 'react'
import { CloseIcon } from './Icons'

/**
 * Centred modal with focus trapping and Escape-to-close.
 */
export default function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const field = panelRef.current?.querySelector('textarea, input')
    if (field) field.focus()
    else panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} overflow-hidden rounded-2xl bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close dialog"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
