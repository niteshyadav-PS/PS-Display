import { useEffect, useState } from 'react'
import { resolvePdfEmbed } from './lib/pdfEmbed'
import { resolveApiUrl } from './lib/apiUrl'

/**
 * Player PDF embed — fetch to blob so Chrome renders the file (avoids blank
 * cross-origin PDF iframes). Google Drive uses its native preview.
 */
export default function PdfViewer({ rawUrl, title = 'PDF' }) {
  const api = resolveApiUrl()
  const origin = api.replace(/\/api\/?$/, '')
  const { embedUrl, kind } = resolvePdfEmbed(rawUrl, { apiUrl: api, apiOrigin: origin })

  const [src, setSrc] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let revoke = ''
    let alive = true

    async function load() {
      if (!embedUrl) {
        setError('No PDF URL')
        return
      }

      if (kind === 'gdrive') {
        if (alive) {
          setSrc(embedUrl)
          setError('')
        }
        return
      }

      try {
        const res = await fetch(embedUrl.split('#')[0])
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer.slice(0, 4))
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
        if (!isPdf) throw new Error('Not a PDF')

        const objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
        revoke = objectUrl
        if (!alive) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setSrc(`${objectUrl}#toolbar=0&navpanes=0&view=FitH`)
        setError('')
      } catch (err) {
        if (alive) {
          setSrc('')
          setError(err.message || 'Failed to load PDF')
        }
      }
    }

    load()
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [embedUrl, kind])

  if (error) {
    return (
      <div className="widget content dark-page" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <h3>PDF</h3>
        <p>{error}</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="widget content dark-page" style={{ display: 'grid', placeItems: 'center' }}>
        <p>Loading PDF…</p>
      </div>
    )
  }

  return (
    <div className="widget media">
      <iframe title={title} src={src} className="widget frame" />
    </div>
  )
}
