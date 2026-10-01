import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Player from './Player'
import Pairing from './Pairing'
import './styles.css'

function ensureFavicon() {
  const href = '/favicon.png'
  for (const rel of ['icon', 'shortcut icon']) {
    let link = document.querySelector(`link[rel='${rel}']`)
    if (!link) {
      link = document.createElement('link')
      link.rel = rel
      document.head.appendChild(link)
    }
    link.type = 'image/png'
    link.href = href
  }
}

ensureFavicon()

/** Keep a TV awake for as long as the browser allows. */
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) {
      let lock = await navigator.wakeLock.request('screen')
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try {
            lock = await navigator.wakeLock.request('screen')
          } catch {
            // Denied — nothing else we can do.
          }
        }
      })
      return lock
    }
  } catch {
    // Unsupported or blocked without a user gesture.
  }
  return null
}

keepAwake()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/d/:publicKey" element={<Player />} />
        <Route path="/pair" element={<Pairing />} />
        <Route path="/" element={<Navigate to="/pair" replace />} />
        <Route path="*" element={<Navigate to="/pair" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
