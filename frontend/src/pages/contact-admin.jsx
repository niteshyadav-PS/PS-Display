import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell, {
  glassCardClass,
  inputClass,
  primaryBtnClass,
  secondaryBtnClass,
} from '../components/AuthShell'
import { authApi } from '../lib/api'

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

export default function ContactAdmin() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await authApi.contactAdmin({ name, email, subject, message })
      setSent(true)
    } catch {
      setSent(true)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className={glassCardClass}>
        <div>
          <h1 className="text-[1.85rem] font-bold tracking-tight text-gray-900">
            Contact Admin
          </h1>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-gray-600">
            Need an account or help accessing the system? Send a request to the administrator and
            we&apos;ll get back to you.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-800">
            Your request has been submitted. An admin will contact you soon.
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Full Name</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            placeholder="John Doe"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSent(false)
            }}
            required
            className={inputClass}
          />
        </label>

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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Subject</span>
          <input
            type="text"
            name="subject"
            placeholder="Request for account access"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              setSent(false)
            }}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-gray-800">Message</span>
          <textarea
            name="message"
            rows={4}
            placeholder="Tell us what you need help with..."
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setSent(false)
            }}
            required
            className="w-full resize-none rounded-xl border border-gray-200 bg-white/80 px-3.5 py-3 text-[0.95rem] text-gray-900 outline-none placeholder:text-gray-400 transition focus:border-brand focus:ring-3 focus:ring-brand/25"
          />
        </label>

        <button type="submit" className={`mt-1 ${primaryBtnClass}`}>
          Send Request
        </button>

        <Link to="/login" className={secondaryBtnClass}>
          <BackIcon />
          Back to Login
        </Link>
      </form>
    </AuthShell>
  )
}
