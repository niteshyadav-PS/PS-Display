import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi, calendarApi, mediaApi, resolveMediaUrl } from '../lib/api'
import { DEFAULT_AVATARS, isDefaultAvatar } from '../lib/avatars'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import {
  CheckIcon,
  ChevronRightIcon,
  GearIcon,
  ImageIcon,
  LayoutIcon,
  LockIcon,
  LogoutIcon,
  PencilIcon,
  UsersIcon,
} from '../components/Icons'

function accountEmailOf(user) {
  const email = user?.email || ''
  if (!email || email.endsWith('@users.local')) return ''
  return email
}

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(null)
  const [name, setName] = useState(user?.name || '')
  const [accountEmail, setAccountEmail] = useState('')
  const [department, setDepartment] = useState(user?.department || '')
  const [organizationName, setOrganizationName] = useState(user?.organizationName || '')
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [teamUsers, setTeamUsers] = useState([])
  const [emailSaving, setEmailSaving] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const avatarInputRef = useRef(null)

  useEffect(() => {
    setName(user?.name || '')
    setAccountEmail(accountEmailOf(user))
    setDepartment(user?.department || '')
    setOrganizationName(user?.organizationName || '')
    setAvatarPreview(user?.avatar || '')
  }, [user])

  useEffect(() => {
    if (searchParams.get('section') === 'password') setOpen('password')
  }, [searchParams])

  useEffect(() => {
    const google = searchParams.get('google')
    if (!google) return
    if (google === 'connected') {
      setMessage('Email connected and calendar fetched.')
      setUsersOpen(true)
      authApi
        .me()
        .then((data) => setUser(data.user))
        .catch(() => {})
      authApi
        .listUsers()
        .then((data) => setTeamUsers(data.users || []))
        .catch(() => {})
    } else if (google === 'fetch-failed') {
      setError('Google sign-in worked, but the calendar could not be fetched. Connect the email again.')
      setUsersOpen(true)
    } else if (google === 'denied') {
      setError('Google connection was cancelled.')
    } else if (google === 'error') {
      setError('Google connection failed. Check OAuth client settings and try again.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('google')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, setUser])

  function toggle(section) {
    setOpen((prev) => (prev === section ? null : section))
    setMessage('')
    setError('')
  }

  const isAdmin = user?.role === 'Administrator'

  useEffect(() => {
    if (!isAdmin) return undefined
    let alive = true
    authApi
      .listUsers()
      .then((data) => {
        if (alive) setTeamUsers(data.users || [])
      })
      .catch(() => {
        if (alive) setTeamUsers([])
      })
    return () => {
      alive = false
    }
  }, [isAdmin])

  async function connectGoogle() {
    setGoogleBusy(true)
    setError('')
    try {
      const data = await calendarApi.connectGoogle('settings')
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setGoogleBusy(false)
    }
  }

  async function disconnectGoogle() {
    setGoogleBusy(true)
    setError('')
    try {
      const data = await calendarApi.disconnectGoogle()
      setUser(data.user)
      setMessage('Google Calendar disconnected.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGoogleBusy(false)
    }
  }

  async function connectUserEmail(person) {
    setEmailSaving(true)
    setError('')
    try {
      const data = await calendarApi.connectGoogle('settings', undefined, person.id)
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setEmailSaving(false)
    }
  }

  async function removeUserEmail(person) {
    setEmailSaving(true)
    setError('')
    setMessage('')
    try {
      await calendarApi.disconnectUserGoogle(person.id)
      setTeamUsers((current) =>
        current.map((row) =>
          row.id === person.id
            ? { ...row, mailConnected: false, googleEmail: '', googleConnected: false }
            : row
        )
      )
      setMessage(`Removed the connected email for ${person.name}. Connect a new one to fetch that calendar.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setEmailSaving(false)
    }
  }

  async function saveEmail(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await authApi.updateMe({ email: accountEmail.trim() })
      setUser(data.user)
      setMessage('Email saved for this account.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await authApi.updateMe({ name })
      setUser(data.user)
      setMessage('Profile updated.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveAvatar(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await authApi.updateMe({ avatar: avatarPreview || '' })
      setUser(data.user)
      setMessage('Profile picture updated.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    setUploadingAvatar(true)
    setError('')
    try {
      const data = await mediaApi.upload(file, `${user?.name || 'avatar'}-photo`)
      setAvatarPreview(data.media?.url || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  async function saveDepartment(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await authApi.updateMe({ department })
      setUser(data.user)
      setMessage('Department updated.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveOrganization(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await authApi.updateMe({ organizationName })
      setUser(data.user)
      setMessage('Organization name updated.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password changed successfully.')
      setOpen(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const avatarSrc = avatarPreview ? resolveMediaUrl(avatarPreview) : ''

  const rows = [
    {
      id: 'avatar',
      label: 'Profile Picture',
      value: user?.avatar
        ? isDefaultAvatar(user.avatar)
          ? 'Default avatar'
          : 'Custom photo'
        : 'Choose a photo or default avatar',
      Icon: ImageIcon,
    },
    
    { id: 'profile', label: 'Profile Name', value: user?.name || '—', Icon: PencilIcon },
    { id: 'email', label: 'Email', value: accountEmailOf(user) || 'Add your email', Icon: GearIcon },
    {
      id: 'organization',
      label: 'Organization Name',
      value: user?.organizationName || 'Not set',
      Icon: LayoutIcon,
    },
    {
      id: 'department',
      label: 'Department',
      value: user?.department || 'Not set',
      Icon: UsersIcon,
    },
    {
      id: 'password',
      label: 'Change Password',
      value: 'Update your account password',
      Icon: LockIcon,
    },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Update your profile, password, and the Google account used for calendars."
      />

      {message ? (
        <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>
      ) : null}
      {error && !open ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="font-semibold text-gray-900">Google Calendar</div>
            <div className="text-sm text-gray-500">
              {user?.googleConnected
                ? `Connected as ${user.googleEmail || 'Google account'}`
                : 'Connect Google so this account’s calendar can appear on displays.'}
            </div>
          </div>
          {user?.googleConnected ? (
            <button
              type="button"
              disabled={googleBusy}
              onClick={disconnectGoogle}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={googleBusy}
              onClick={connectGoogle}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {googleBusy ? 'Opening Google...' : 'Connect Google Account'}
            </button>
          )}
        </div>
      </div>

      {isAdmin ? (
        <button
          type="button"
          onClick={() => {
            setUsersOpen(true)
            setError('')
          }}
          className="mb-5 flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md sm:px-5"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-900 text-white">
            <UsersIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900">All users</div>
            <div className="mt-0.5 text-sm text-gray-500">
              {teamUsers.length
                ? `${teamUsers.filter((person) => person.mailConnected).length} of ${teamUsers.length} emails connected`
                : 'No users created yet'}
            </div>
          </div>
          <ChevronRightIcon className="shrink-0 text-gray-400" />
        </button>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {rows.map((row) => (
          <div key={row.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => (row.readOnly ? null : toggle(row.id))}
              className={`flex w-full items-center gap-3 px-4 py-4 text-left sm:gap-4 sm:px-5 ${
                row.readOnly ? 'cursor-default' : 'transition hover:bg-gray-50'
              }`}
            >
              {row.id === 'avatar' && avatarSrc ? (
                <img
                  src={resolveMediaUrl(user?.avatar || avatarPreview)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-brand/30"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700">
                  <row.Icon size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">{row.label}</div>
                <div className="truncate text-sm text-gray-500">{row.value}</div>
              </div>
              {!row.readOnly ? <ChevronRightIcon className="shrink-0 text-gray-400" /> : null}
            </button>

            {open === 'avatar' && row.id === 'avatar' ? (
              <form onSubmit={saveAvatar} className="space-y-4 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-brand/20 text-2xl font-bold text-gray-800 ring-2 ring-brand/30">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : (
                      (user?.name || 'U').slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onAvatarFile}
                    />
                    <button
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
                    >
                      {uploadingAvatar ? 'Uploading...' : 'Upload photo'}
                    </button>
                    {avatarPreview ? (
                      <button
                        type="button"
                        onClick={() => setAvatarPreview('')}
                        className="ml-2 text-sm font-semibold text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-800">Or pick a default avatar</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {DEFAULT_AVATARS.map((avatar) => {
                      const selected = avatarPreview === avatar.path
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          title={avatar.label}
                          onClick={() => setAvatarPreview(avatar.path)}
                          className={`overflow-hidden rounded-full ring-2 transition ${
                            selected
                              ? 'ring-brand ring-offset-2 ring-offset-gray-50'
                              : 'ring-transparent hover:ring-gray-300'
                          }`}
                        >
                          <img
                            src={avatar.path}
                            alt={avatar.label}
                            className="aspect-square w-full object-cover"
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving || uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarPreview(user?.avatar || '')
                      setOpen(null)
                    }}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {open === 'profile' && row.id === 'profile' ? (
              <form onSubmit={saveProfile} className="space-y-3 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="Your name"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {open === 'email' && row.id === 'email' ? (
              <form onSubmit={saveEmail} className="space-y-3 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <input
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="name@company.com"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountEmail(accountEmailOf(user))
                      setOpen(null)
                    }}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {open === 'department' && row.id === 'department' ? (
              <form onSubmit={saveDepartment} className="space-y-3 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="e.g. NOC, Sales, Marketing"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {open === 'organization' && row.id === 'organization' ? (
              <form onSubmit={saveOrganization} className="space-y-3 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="e.g. Profile Solution"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {open === 'password' && row.id === 'password' ? (
              <form onSubmit={savePassword} className="space-y-3 bg-gray-50 px-4 py-4 sm:px-5">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="Current password"
                  required
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="New password (min. 6)"
                  minLength={6}
                  required
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="Confirm new password"
                  minLength={6}
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckIcon size={14} /> Update Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          logout()
          navigate('/login')
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50"
      >
        <LogoutIcon size={16} />
        Log out
      </button>

      {usersOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-gray-950/50 backdrop-blur-[2px]"
            aria-label="Close user list"
            onClick={() => setUsersOpen(false)}
          />
          <div className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-gray-950">Created users</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Connect a mailbox only for the people who should share a calendar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUsersOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 hover:bg-gray-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6">
              {teamUsers.map((person) => {
                const savedEmail = person.mailConnected ? person.googleEmail || accountEmailOf(person) : ''
                const initial = (person.name || person.username || '?').slice(0, 1).toUpperCase()
                return (
                  <li key={person.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-gray-950">{person.name}</div>
                          {person.department ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {person.department}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500">{person.username || 'User'}</div>
                        {savedEmail ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                Already connected
                              </div>
                              <div className="mt-0.5 truncate text-sm font-medium text-emerald-950">{savedEmail}</div>
                            </div>
                            <button
                              type="button"
                              disabled={emailSaving}
                              onClick={() => removeUserEmail(person)}
                              className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              Remove email
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={emailSaving}
                            onClick={() => connectUserEmail(person)}
                            className="mt-3 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                          >
                            {emailSaving ? 'Opening Google...' : 'Connect email'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
              {teamUsers.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
                  No users created yet.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
