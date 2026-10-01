import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { PencilIcon, PlusIcon, UsersIcon } from '../components/Icons'

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

const DEPARTMENT_OPTIONS = [
  'Sale & Marketing',
  'Purchase',
  'Design',
  'Account',
  'Project',
  'HR',
]

const CUSTOM_DEPARTMENT = '__custom__'

const emptyForm = {
  name: '',
  username: '',
  password: '',
  department: '',
  role: 'User',
}

function departmentToChoice(department = '') {
  if (!department) return { choice: '', custom: '' }
  if (DEPARTMENT_OPTIONS.includes(department)) {
    return { choice: department, custom: '' }
  }
  return { choice: CUSTOM_DEPARTMENT, custom: department }
}

export default function CreateUser() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [departmentChoice, setDepartmentChoice] = useState('')
  const [customDepartment, setCustomDepartment] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordFor, setPasswordFor] = useState(null)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [showRowPassword, setShowRowPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const isAdmin = user?.role === 'Administrator'
  const isEditing = Boolean(editingId)

  async function loadUsers() {
    setLoadingList(true)
    try {
      const data = await authApi.listUsers()
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadUsers()
    else setLoadingList(false)
  }, [isAdmin])

  function resolveDepartment() {
    if (departmentChoice === CUSTOM_DEPARTMENT) {
      return customDepartment.trim()
    }
    return departmentChoice.trim()
  }

  function resetForm() {
    setForm(emptyForm)
    setDepartmentChoice('')
    setCustomDepartment('')
    setEditingId(null)
    setShowPassword(false)
  }

  function startEdit(u) {
    setError('')
    setSuccess('')
    setEditingId(u.id)
    setForm({
      name: u.name || '',
      username: u.username || '',
      password: '',
      department: u.department || '',
      role: u.role || 'User',
    })
    const { choice, custom } = departmentToChoice(u.department || '')
    setDepartmentChoice(choice)
    setCustomDepartment(custom)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">
        Only administrators can create and manage users.
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const department = resolveDepartment()
    if (!department) {
      setError('Please select or enter a department')
      return
    }

    if (!isEditing && !form.password) {
      setError('Password is required for new users')
      return
    }

    const username = form.username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
      setError('Username can use letters, numbers, dots, and dashes')
      return
    }

    if (form.password && form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      if (isEditing) {
        const payload = {
          name: form.name,
          username,
          department,
          role: form.role,
        }
        if (form.password) payload.password = form.password
        await authApi.updateUser(editingId, payload)
        setSuccess(`User “${form.name}” updated successfully.`)
      } else {
        const created = {
          name: form.name,
          username,
          password: form.password,
          department,
        }
        await authApi.createUser(created)
        setSuccess(`User “${form.name}” created successfully.`)
      }
      resetForm()
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveUserPassword(person) {
    if (passwordDraft.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setPasswordSaving(true)
    setError('')
    setSuccess('')
    try {
      await authApi.updateUser(person.id, { password: passwordDraft })
      setPasswordFor(null)
      setPasswordDraft('')
      setShowRowPassword(false)
      setSuccess(`Password updated for ${person.name}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  function handleDelete(id, name) {
    setDeleteTarget({ id, name })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const { id, name } = deleteTarget
    setDeleting(true)
    setError('')
    setSuccess('')
    try {
      await authApi.deleteUser(id)
      if (editingId && String(editingId) === String(id)) resetForm()
      setSuccess(`${name} was removed.`)
      setDeleteTarget(null)
      await loadUsers()
    } catch (err) {
      setDeleteTarget(null)
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Users"
        description="Add people, assign a department, and manage how they sign in."
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-gray-800">
              {isEditing ? <PencilIcon size={18} /> : <PlusIcon size={18} />}
            </span>
            <h3 className="font-bold text-gray-900">{isEditing ? 'Edit user' : 'New user'}</h3>
          </div>
          {isEditing ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        ) : null}
        {success ? (
          <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Full name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-brand"
              placeholder="Jane Doe"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Username</span>
            <input
              required
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-brand"
              placeholder="jane"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Department</span>
            <select
              required
              value={departmentChoice}
              onChange={(e) => {
                setDepartmentChoice(e.target.value)
                if (e.target.value !== CUSTOM_DEPARTMENT) setCustomDepartment('')
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 outline-none focus:border-brand"
            >
              <option value="" disabled>
                Select department
              </option>
              {DEPARTMENT_OPTIONS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
              <option value={CUSTOM_DEPARTMENT}>Add your own…</option>
            </select>
          </label>
          {departmentChoice === CUSTOM_DEPARTMENT ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Custom department</span>
              <input
                required
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-brand"
                placeholder="Enter department name"
              />
            </label>
          ) : null}

          {isEditing ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 outline-none focus:border-brand"
              >
                <option value="User">User</option>
                <option value="Administrator">Administrator</option>
              </select>
            </label>
          ) : null}

          <label
            className={`block text-sm ${
              departmentChoice === CUSTOM_DEPARTMENT || isEditing ? 'sm:col-span-2' : ''
            }`}
          >
            <span className="mb-1.5 block font-medium text-gray-700">
              {isEditing ? 'New password' : 'Password'}
            </span>
            <div className="relative">
              <input
                required={!isEditing}
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-11 outline-none focus:border-brand"
                placeholder={isEditing ? 'Leave blank to keep the current password' : 'Min. 8 characters'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((open) => !open)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 grid -translate-y-1/2 place-items-center p-1 text-gray-400 hover:text-gray-700"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </label>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          {isEditing
            ? 'Leave password blank to keep the existing password.'
            : (
              <>
                Role is set to <strong>User</strong> automatically.
              </>
            )}
        </p>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save Changes' : 'Create User'}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 text-gray-700">
            <UsersIcon size={18} />
          </span>
          <div>
            <h3 className="font-bold text-gray-900">Team users</h3>
            <p className="text-sm text-gray-500">
              {loadingList ? 'Loading...' : `${users.length} users`}
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {users.map((u) => (
            <div
              key={u.id}
              className={`px-4 py-4 sm:px-5 ${
                String(editingId) === String(u.id) ? 'bg-brand/5' : ''
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{u.name}</div>
                  <div className="truncate text-sm text-gray-500">{u.username}</div>
                  {u.department ? (
                    <div className="mt-0.5 text-xs font-medium text-gray-400">{u.department}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.displays?.length ? (
                      u.displays.map((display) => (
                        <Link
                          key={display.id}
                          to={`/app/displays/${display.id}/edit`}
                          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-brand/20"
                        >
                          {display.name}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">No displays yet</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-gray-800">
                    {u.role}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(u)}
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordFor((current) => (current === u.id ? null : u.id))
                      setPasswordDraft('')
                      setShowRowPassword(false)
                      setError('')
                    }}
                    className="text-sm font-semibold text-gray-700 hover:underline"
                  >
                    Change password
                  </button>
                  {String(u.id) !== String(user?.id) ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id, u.name)}
                      className="text-sm font-semibold text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-gray-400">You</span>
                  )}
                </div>
              </div>
              {passwordFor === u.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveUserPassword(u)
                  }}
                  className="mt-3 flex w-full flex-wrap items-center gap-2"
                >
                  <input
                    type={showRowPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    placeholder="New password"
                    className="min-w-[200px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRowPassword((open) => !open)}
                    aria-label={showRowPassword ? 'Hide password' : 'Show password'}
                    title={showRowPassword ? 'Hide password' : 'Show password'}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <EyeIcon open={showRowPassword} />
                  </button>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {passwordSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordFor(null)}
                    className="text-xs font-semibold text-gray-500"
                  >
                    Cancel
                  </button>
                </form>
              ) : null}
            </div>
          ))}
          {!loadingList && users.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="Create the first account above. They can sign in with the username and password you set."
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove user"
        body={
          deleteTarget
            ? `${deleteTarget.name} will lose access to PS Display. Displays they created stay in your account.`
            : ''
        }
        confirmLabel="Remove user"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
