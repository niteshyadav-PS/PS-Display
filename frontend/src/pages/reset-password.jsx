import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthShell, {
  glassCardClass,
  inputClass,
  primaryBtnClass,
  secondaryBtnClass,
} from '../components/AuthShell'
import { authApi } from '../lib/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <div className={glassCardClass}>
          <h1 className="text-[1.6rem] font-bold tracking-tight text-gray-900">
            Reset link missing
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-gray-600">
            This page needs a reset link from your email. Request a new one to continue.
          </p>
          <Link to="/forgot-password" className={primaryBtnClass + ' grid place-items-center'}>
            Request a reset link
          </Link>
          <Link to="/login" className={secondaryBtnClass}>
            Back to Login
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className={glassCardClass}>
        <div>
          <h1 className="text-[1.85rem] font-bold tracking-tight text-gray-900">Set a new password</h1>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-gray-600">
            {email ? `Resetting the password for ${email}.` : 'Choose a new password for your account.'}
          </p>
        </div>

        {done ? (
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-800">
            Password updated. Taking you to sign in...
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-gray-700">New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-gray-700">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter the password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </label>

        <button type="submit" disabled={saving || done} className={primaryBtnClass}>
          {saving ? 'Saving...' : 'Update Password'}
        </button>

        <Link to="/login" className={secondaryBtnClass}>
          Back to Login
        </Link>
      </form>
    </AuthShell>
  )
}
