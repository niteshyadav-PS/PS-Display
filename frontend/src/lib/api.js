function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'
  if (typeof window === 'undefined') return configured.replace(/\/$/, '')

  try {
    const url = new URL(configured)
    const pageHost = window.location.hostname
    const isLocalApi = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const isLanPage = pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1'
    // Admin opened via LAN IP (e.g. TV/dev phone sharing Wi‑Fi) must talk to the same host.
    if (isLocalApi && isLanPage) {
      url.hostname = pageHost
      return url.toString().replace(/\/$/, '')
    }
  } catch {
    // fall through
  }

  return configured.replace(/\/$/, '')
}

const API_URL = resolveApiUrl()

export function apiOrigin() {
  return API_URL.replace(/\/api\/?$/, '')
}

/** Sites that must load directly (proxy breaks auth / SPAs like Power BI) */
function shouldEmbedDirect(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.includes('powerbi.com') ||
      host.includes('fabric.microsoft.com') ||
      host.includes('app.powerbi.com') ||
      host.includes('msit.powerbi.com') ||
      (host.endsWith('.microsoft.com') && (host.includes('powerbi') || host.includes('fabric')))
    )
  } catch {
    return false
  }
}

/** Embed URL: proxy most sites; Power BI / Fabric must be direct iframe */
export function resolveWebEmbedUrl(url) {
  if (!url) return ''
  let next = String(url).trim()
  if (!next) return ''
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`
  if (next.includes('/api/web/embed?')) return next
  if (shouldEmbedDirect(next)) return next
  return `${API_URL}/web/embed?url=${encodeURIComponent(next)}`
}

export function isDirectWebEmbed(url) {
  if (!url) return false
  let next = String(url).trim()
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`
  return shouldEmbedDirect(next)
}

/** Make media URLs work for uploads + optional remote proxy */
export function resolveMediaUrl(url, { preferDirect = false } = {}) {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw

  // App-bundled assets (default avatars) are served by the frontend itself.
  if (raw.startsWith('/') && !raw.startsWith('/uploads/')) return raw

  try {
    const parsed = raw.startsWith('/')
      ? new URL(raw, apiOrigin())
      : new URL(raw)
    // Always serve our uploads from the current API host (fixes localhost vs LAN IP).
    if (parsed.pathname.startsWith('/uploads/')) {
      return `${apiOrigin()}${parsed.pathname}${parsed.search}`
    }
  } catch {
    // fall through
  }

  if (/^https?:\/\//i.test(raw)) {
    if (raw.startsWith(apiOrigin()) || raw.includes('/api/media/proxy')) return raw
    // Prefer direct playback for video — proxy buffers the whole file and fails large ones.
    if (preferDirect) return raw
    // Proxy remote files so hotlink/CORS blocks don't break the player
    return `${API_URL}/media/proxy?url=${encodeURIComponent(raw)}`
  }

  return raw
}

export function resolveVideoUrl(url) {
  return resolveMediaUrl(url, { preferDirect: true })
}

/**
 * Store portable media refs in display layouts.
 * Uploads become `/uploads/...` so they keep working across localhost / LAN / deploy hosts.
 */
export function canonicalMediaRef(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw
  if (raw.startsWith('/uploads/')) return raw.split(/[?#]/)[0]

  try {
    const parsed = raw.startsWith('/')
      ? new URL(raw, apiOrigin())
      : new URL(raw)
    if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname
  } catch {
    // fall through
  }

  return raw
}

const TOKEN_KEY = 'ps_token'

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

export function setToken(token, { remember = true } = {}) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (!token) return
  const store = remember ? localStorage : sessionStorage
  store.setItem(TOKEN_KEY, token)
}

/** Raised for non-2xx responses so callers can branch on status. */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/** Notified when the API rejects our token, so the app can sign out cleanly. */
let onUnauthorized = null
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export async function api(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    const hint =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
        ? ` (API: ${API_URL})`
        : ''
    throw new ApiError(
      0,
      `Cannot reach the server${hint}. Is the API running on port 5000?`
    )
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401 && auth && getToken()) onUnauthorized?.()
    throw new ApiError(res.status, data.message || `Request failed (${res.status})`, data)
  }

  return data
}

export const authApi = {
  login: (username, password) =>
    api('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => api('/auth/me'),
  updateMe: (payload) => api('/auth/me', { method: 'PUT', body: payload }),
  changePassword: (payload) => api('/auth/change-password', { method: 'POST', body: payload }),
  listUsers: () => api('/auth/users'),
  createUser: (payload) => api('/auth/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => api(`/auth/users/${id}`, { method: 'PUT', body: payload }),
  deleteUser: (id) => api(`/auth/users/${id}`, { method: 'DELETE' }),
  forgotPassword: (email) =>
    api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) =>
    api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),
  contactAdmin: (payload) => api('/auth/contact-admin', { method: 'POST', body: payload, auth: false }),
  listSupportRequests: () => api('/auth/support-requests'),
  updateSupportRequest: (id, status) =>
    api(`/auth/support-requests/${id}`, { method: 'PUT', body: { status } }),
}

export const displaysApi = {
  list: (params) => api(`/displays${buildQuery(params)}`),
  get: (id) => api(`/displays/${id}`),
  create: (payload) => api('/displays', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/displays/${id}`, { method: 'PUT', body: payload }),
  publish: (id) => api(`/displays/${id}/publish`, { method: 'POST' }),
  stop: (id) => api(`/displays/${id}/stop`, { method: 'POST' }),
  resume: (id) => api(`/displays/${id}/resume`, { method: 'POST' }),
  duplicate: (id) => api(`/displays/${id}/duplicate`, { method: 'POST' }),
  pair: (id, code) => api(`/displays/${id}/pair`, { method: 'POST', body: { code } }),
  resetCode: (id) => api(`/displays/${id}/reset-code`, { method: 'POST' }),
  remove: (id) => api(`/displays/${id}`, { method: 'DELETE' }),
  public: (key) => api(`/displays/public/${key}`, { auth: false }),
}

export const dashboardApi = {
  stats: () => api('/dashboard/stats'),
}

export const mediaApi = {
  list: (params) => api(`/media${buildQuery(params)}`),
  create: (payload) => api('/media', { method: 'POST', body: payload }),
  usage: (id) => api(`/media/${id}/usage`),
  remove: (id, { force = false } = {}) =>
    api(`/media/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
  async upload(file, name = '') {
    const form = new FormData()
    form.append('file', file)
    if (name) form.append('name', name)

    const headers = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${API_URL}/media/upload`, { method: 'POST', headers, body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, data.message || 'Upload failed', data)
    return data
  },
}

export const calendarApi = {
  status: () => api('/calendar/status'),
  connectGoogle: (returnTo, department, forUser) => {
    const params = new URLSearchParams()
    if (returnTo) params.set('returnTo', returnTo)
    if (department) params.set('department', department)
    if (forUser) params.set('forUser', forUser)
    const query = params.toString()
    return api(`/calendar/google/connect${query ? `?${query}` : ''}`)
  },
  disconnectUserGoogle: (userId) =>
    api('/calendar/google/disconnect-user', { method: 'POST', body: { userId } }),
  disconnectGoogle: (department) =>
    api('/calendar/google/disconnect', {
      method: 'POST',
      body: department ? { department } : {},
    }),
  fetchGoogle: (email, days = 1) =>
    api('/calendar/google', { method: 'POST', body: { email, days } }),
  departments: () => api('/calendar/departments'),
  fetchDepartment: (department, days = 1) =>
    api('/calendar/google/department', { method: 'POST', body: { department, days } }),
}

export const weatherApi = {
  get: (city, units = 'metric') => api(`/weather${buildQuery({ city, units })}`),
}
