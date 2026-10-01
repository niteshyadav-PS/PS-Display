import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readPairedKey, writePairedKey } from './lib/cache'
import { resolveApiUrl } from './lib/apiUrl'

const API_URL = resolveApiUrl()

/**
 * Landing screen for an unpaired TV: the operator types the code shown here
 * into the admin portal, or enters the display's code on this screen.
 */
export default function Pairing() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')
  const [checking, setChecking] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // If this device was already paired, go straight back to its display.
  useEffect(() => {
    const saved = readPairedKey()
    if (saved) navigate(`/d/${saved}`, { replace: true })
  }, [navigate])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function attempt(rawCode) {
    const value = rawCode.trim().toUpperCase()
    if (value.length < 4) {
      setStatus('Enter the full code from the portal.')
      return
    }

    setChecking(true)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/displays/pair/${encodeURIComponent(value)}`)
      const data = await res.json().catch(() => ({}))

      if (data?.paired && data.publicKey) {
        writePairedKey(data.publicKey)
        navigate(`/d/${data.publicKey}`, { replace: true })
        return
      }

      setStatus('That code is not active yet. Publish the display in the portal, then try again.')
    } catch {
      setStatus('Cannot reach the server. Check the network and try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="boot pairing">
      <div className="pairing-card">
        <h1>Pair this screen</h1>
        <p>
          In the admin portal open <strong>My Displays</strong>, choose a display, click{' '}
          <strong>PAIR</strong>, then enter its code below.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            attempt(code)
          }}
        >
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            aria-label="Pairing code"
          />
          <button type="submit" disabled={checking}>
            {checking ? 'Checking...' : 'Connect'}
          </button>
        </form>

        {status ? <p className="pairing-status">{status}</p> : null}

        <p className="pairing-hint">
          You can also open the player URL directly: <code>/d/&lt;display key&gt;</code>
        </p>
      </div>
    </div>
  )
}
