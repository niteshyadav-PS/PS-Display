import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell, {
  glassCardClass,
  inputClass,
  primaryBtnClass,
} from '../components/AuthShell'
import { useAuth } from '../context/AuthContext'

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.3M6.1 6.1A17.3 17.3 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning!'
  if (hour < 17) return 'Good Afternoon!'
  return 'Good Evening!'
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const greeting = useMemo(() => getGreeting(), [])
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password, { remember })
      navigate('/app/dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className={glassCardClass}>
        <div>
          <h1 className="text-[1.85rem] font-bold tracking-tight text-gray-900">{greeting}</h1>
          <p className="mt-1 text-[0.98rem] font-medium text-gray-600">
            Thank you for coming back!
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Username</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Password</span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 grid -translate-y-1/2 place-items-center p-1 text-gray-400 transition hover:text-gray-600"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        <div className="flex items-center justify-between gap-4">
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            <span>Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="text-sm text-gray-500 no-underline transition hover:text-gray-800 hover:underline"
          >
            Forgot Password?
          </Link>
        </div>

        <button type="submit" disabled={loading} className={`mt-1 ${primaryBtnClass} disabled:opacity-60`}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-[0.92rem] text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/contact-admin" className="font-semibold text-brand no-underline hover:underline">
            Contact Admin
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
