import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from './Icons'
import { setNavDir } from '../lib/navTransition'

/**
 * Shared back control. Uses browser history when possible, otherwise a fallback route.
 */
export default function BackButton({
  fallback = '/app/dashboard',
  label = 'Back',
  className = '',
  variant = 'light',
}) {
  const navigate = useNavigate()

  function handleBack() {
    setNavDir('back')
    // One step back in history when we have in-app navigation; otherwise use fallback.
    if (window.history.state?.idx > 0) {
      navigate(-1, { viewTransition: true })
      return
    }
    navigate(fallback, { viewTransition: true })
  }

  const styles =
    variant === 'dark'
      ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:border-brand/40 hover:bg-brand/5 hover:text-gray-900'

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${styles} ${className}`}
      aria-label={label}
      title={label}
    >
      <ChevronLeftIcon size={16} />
      <span>{label}</span>
    </button>
  )
}
