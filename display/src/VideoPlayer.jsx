import { useEffect, useRef, useState } from 'react'

/**
 * Signage video player — forces muted autoplay (TV / Chrome policy),
 * supports loop vs play-once, and shows a clear error if the file cannot load.
 */
export default function VideoPlayer({ src, loop = true, fit = 'cover', title = 'Video' }) {
  const ref = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    const el = ref.current
    if (!el || !src) return undefined

    el.muted = true
    el.defaultMuted = true
    el.playsInline = true
    el.setAttribute('playsinline', '')
    el.setAttribute('webkit-playsinline', '')

    const tryPlay = () => {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay can still fail on some TVs; retry once after a short delay.
          setTimeout(() => {
            el.play()?.catch(() => {
              setError('Autoplay blocked — tap the screen, then try again')
            })
          }, 400)
        })
      }
    }

    function onCanPlay() {
      tryPlay()
    }
    function onError() {
      setError('Video failed to load. Use MP4 (H.264) or WebM, then re-select the file.')
    }
    function onEnded() {
      if (!loop) {
        el.pause()
        el.currentTime = el.duration || 0
      }
    }

    el.addEventListener('canplay', onCanPlay)
    el.addEventListener('error', onError)
    el.addEventListener('ended', onEnded)
    // Load immediately in case the browser already has the resource.
    el.load()
    tryPlay()

    return () => {
      el.removeEventListener('canplay', onCanPlay)
      el.removeEventListener('error', onError)
      el.removeEventListener('ended', onEnded)
      el.pause()
    }
  }, [src, loop])

  if (!src) {
    return (
      <div className="widget media video-fallback">
        <strong>Video</strong>
        <span>Select media in the editor</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="widget media video-fallback">
        <strong>{title}</strong>
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="widget media">
      <video
        ref={ref}
        key={`${src}|${loop ? 'loop' : 'once'}`}
        src={src}
        autoPlay
        muted
        playsInline
        loop={loop}
        preload="auto"
        controls={false}
        style={{ objectFit: fit || 'cover' }}
      />
    </div>
  )
}
