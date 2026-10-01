import { useEffect, useState } from 'react'
import { resolvePdfEmbed } from '../lib/pdfEmbed'

/**
 * Renders a PDF reliably in the editor canvas.
 *
 * Cross-origin PDFs in an <iframe> are often blank (X-Frame-Options / Chrome PDF
 * viewer quirks). For proxied and uploaded files we fetch the bytes and show a
 * same-origin blob: URL instead. Google Drive keeps its own /preview embed.
 */
export default function PdfViewer({
  rawUrl,
  title = 'PDF',
  className = 'h-full w-full border-0 bg-white',
  shellClass = '',
}) {
  const api = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  const origin = api.replace(/\/api\/?$/, '')
  const { embedUrl, kind } = resolvePdfEmbed(rawUrl, { apiUrl: api, apiOrigin: origin })

  const [src, setSrc] = useState('')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')

  useEffect(() => {
    let revoke = ''
    let alive = true

    async function load() {
      if (!embedUrl) {
        setStatus('error')
        setError('No PDF URL')
        setSrc('')
        return
      }

      // Drive / external HTML viewers must stay as a direct iframe.
      if (kind === 'gdrive') {
        if (!alive) return
        setSrc(embedUrl)
        setStatus('ready')
        return
      }

      setStatus('loading')
      setError('')
      try {
        const res = await fetch(embedUrl.split('#')[0])
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message || `Could not load PDF (${res.status})`)
        }

        const type = (res.headers.get('content-type') || '').toLowerCase()
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer.slice(0, 5))
        const isPdf =
          type.includes('pdf') ||
          (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)

        if (!isPdf) {
          throw new Error(
            'That link did not return a PDF file. Use a direct .pdf URL, a Google Drive file link, or upload the file.'
          )
        }

        const blob = new Blob([buffer], { type: 'application/pdf' })
        const objectUrl = URL.createObjectURL(blob)
        revoke = objectUrl
        if (!alive) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setSrc(`${objectUrl}#toolbar=0&navpanes=0&view=FitH`)
        setStatus('ready')
      } catch (err) {
        if (!alive) return
        setSrc('')
        setStatus('error')
        setError(err.message || 'Failed to load PDF')
      }
    }

    load()
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [embedUrl, kind])

  if (!rawUrl) {
    return (
      <div className={`grid place-items-center p-3 text-center text-sm ${shellClass}`}>
        PDF
        <span className="mt-1 px-3 text-xs opacity-70">
          Paste a direct .pdf link, a Google Drive file link, or upload in Media Library
        </span>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className={`grid place-items-center p-3 text-sm ${shellClass}`}>
        <span className="inline-flex items-center gap-2 opacity-70">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Loading PDF…
        </span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={`grid place-items-center p-3 text-center text-sm ${shellClass}`}>
        <span className="font-semibold">PDF could not load</span>
        <span className="mt-1 px-3 text-xs leading-snug opacity-70">{error}</span>
      </div>
    )
  }

  return (
    <div className={`${shellClass} relative overflow-hidden bg-white`}>
      <iframe title={title} src={src} className={className} />
    </div>
  )
}
