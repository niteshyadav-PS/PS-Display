import dns from 'dns/promises'
import net from 'net'
import config from '../config/env.js'

/** RFC1918 + loopback + link-local + CGNAT ranges we must never let clients reach. */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  // IPv4-mapped (::ffff:10.0.0.1)
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

export function isPrivateAddress(value) {
  const host = String(value || '').trim().toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true

  const version = net.isIP(host)
  if (version === 4) return isPrivateIPv4(host)
  if (version === 6) return isPrivateIPv6(host)
  return false
}

/**
 * Validate a user-supplied URL for server-side fetching.
 * Blocks non-http(s) schemes, credentials in the URL, and hosts that resolve
 * to private/internal addresses (SSRF).
 */
export async function assertPublicUrl(rawUrl) {
  const value = String(rawUrl || '').trim()
  if (!value) {
    const err = new Error('A URL is required')
    err.status = 400
    throw err
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    const err = new Error('Invalid URL')
    err.status = 400
    throw err
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Only http and https URLs are allowed')
    err.status = 400
    throw err
  }

  if (parsed.username || parsed.password) {
    const err = new Error('URLs with embedded credentials are not allowed')
    err.status = 400
    throw err
  }

  if (isPrivateAddress(parsed.hostname)) {
    const err = new Error('Private and internal network URLs are not allowed')
    err.status = 400
    throw err
  }

  // Resolve the hostname so a public name pointing at an internal IP is still blocked.
  try {
    const records = await dns.lookup(parsed.hostname, { all: true })
    if (records.some((r) => isPrivateAddress(r.address))) {
      const err = new Error('Private and internal network URLs are not allowed')
      err.status = 400
      throw err
    }
  } catch (err) {
    if (err.status) throw err
    const dnsErr = new Error('Could not resolve that host')
    dnsErr.status = 400
    throw dnsErr
  }

  return parsed
}

/**
 * Fetch a validated public URL with a timeout and a hard response size cap so a
 * huge or slow upstream cannot exhaust server memory.
 */
export async function fetchPublicUrl(
  rawUrl,
  { headers = {}, maxBytes = config.maxProxyBytes, timeoutMs = 15000 } = {}
) {
  const parsed = await assertPublicUrl(rawUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const upstream = await fetch(parsed.toString(), {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })

    const declared = Number(upstream.headers.get('content-length') || 0)
    if (declared && declared > maxBytes) {
      const err = new Error(`Remote file is larger than the ${Math.round(maxBytes / 1048576)}MB limit`)
      err.status = 413
      throw err
    }

    return { upstream, parsed, readBody: () => readCapped(upstream, maxBytes) }
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('Remote server took too long to respond')
      timeout.status = 504
      throw timeout
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Read a response body in chunks, aborting once it exceeds maxBytes. */
async function readCapped(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0)

  const chunks = []
  let total = 0

  for await (const chunk of response.body) {
    total += chunk.length
    if (total > maxBytes) {
      const err = new Error(`Remote file is larger than the ${Math.round(maxBytes / 1048576)}MB limit`)
      err.status = 413
      throw err
    }
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}
