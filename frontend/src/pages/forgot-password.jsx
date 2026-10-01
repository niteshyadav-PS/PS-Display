import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell, {
  glassCardClass,
  inputClass,
  primaryBtnClass,
  secondaryBtnClass,
} from '../components/AuthShell'
import { authApi } from '../lib/api'

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [resetUrl, setResetUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await authApi.forgotPassword(email)
      // No mail transport is configured yet, so the API hands back the link in development.
      setResetUrl(data?.resetUrl || '')
      setSent(true)
    } catch {
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className={glassCardClass}>
        <div>
          <h1 className="text-[1.85rem] font-bold tracking-tight text-gray-900">
            Forgot Password?
          </h1>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-gray-600">
            No worries! Enter your registered email address below, and we will send you secure
            instructions to reset your password.
          </p>
        </div>

        {sent ? (
          <div className="space-y-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-800">
            <p>
              If <span className="font-semibold">{email}</span> is registered, reset instructions
              are on their way.
            </p>
            {resetUrl ? (
              <p className="break-all text-xs text-gray-700">
                Email is not configured yet, so use this link directly:{' '}
                <Link to={resetUrl.replace(/^.*?(\/reset-password)/, '$1')} className="font-semibold text-brand underline">
                  Reset your password
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Email Address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="john@gmail.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setSent(false)
            }}
            required
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className={`mt-1 flex items-center justify-center gap-2 disabled:opacity-60 ${primaryBtnClass}`}
        >
          <SendIcon />
          {busy ? 'Sending...' : 'Send Reset Link'}
        </button>

        <Link to="/login" className={secondaryBtnClass}>
          <BackIcon />
          Back to Login
        </Link>
      </form>
    </AuthShell>
  )
}
