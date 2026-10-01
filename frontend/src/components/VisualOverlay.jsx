import { normalizeOverlay, isOverlayActive } from '../lib/pageVisuals'

function FallingGlyphs({ items, className, opacity }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} style={{ opacity, pointerEvents: 'none' }} aria-hidden>
      {items.map((item, i) => (
        <span
          key={i}
          className="ps-snowflake"
          style={{
            left: `${(i * 37 + (item.offset || 0)) % 100}%`,
            animationDelay: `${(i % 10) * 0.32}s`,
            animationDuration: `${5.5 + (i % 6)}s`,
            fontSize: `${item.size || 14 + (i % 8)}px`,
            opacity: 0.4 + (i % 5) * 0.1,
          }}
        >
          {item.glyph}
        </span>
      ))}
    </div>
  )
}

function EventBanner({ message, accent = '#8bc53f' }) {
  if (!message) return null
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex justify-center px-6 pt-8"
      aria-hidden
    >
      <div
        className="max-w-[90%] rounded-2xl px-6 py-3 text-center text-[28px] font-extrabold tracking-tight text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${accent}, #0f172a)`,
          textShadow: '0 2px 12px rgba(0,0,0,0.35)',
        }}
      >
        {message}
      </div>
    </div>
  )
}

/**
 * Full-bleed decorative / event layer. Pass forceShow in the editor so schedules
 * still preview; the player should omit forceShow and respect the schedule.
 */
export default function VisualOverlay({ overlay, className = '', forceShow = false, now }) {
  const cfg = normalizeOverlay(overlay)
  if (cfg.type === 'none') return null
  if (!forceShow && !isOverlayActive(cfg, now || new Date())) return null

  const { type, opacity, message } = cfg
  const style = { opacity, pointerEvents: 'none' }

  if (type === 'birthday') {
    const glyphs = Array.from({ length: 22 }).map((_, i) => ({
      glyph: ['🎂', '🎈', '🎉', '✨', '🎁'][i % 5],
      size: 16 + (i % 10),
      offset: i * 3,
    }))
    return (
      <div className={`absolute inset-0 ${className}`} style={{ pointerEvents: 'none' }}>
        <FallingGlyphs items={glyphs} opacity={opacity} />
        <EventBanner message={message || 'Happy Birthday!'} accent="#f472b6" />
      </div>
    )
  }

  if (type === 'balloons') {
    const glyphs = Array.from({ length: 18 }).map((_, i) => ({
      glyph: ['🎈', '🎈', '🎀', '✨'][i % 4],
      size: 18 + (i % 12),
      offset: i * 5,
    }))
    return (
      <div className={`absolute inset-0 ${className}`} style={{ pointerEvents: 'none' }}>
        <FallingGlyphs items={glyphs} opacity={opacity} />
        <EventBanner message={message} accent="#38bdf8" />
      </div>
    )
  }

  if (type === 'celebration') {
    const glyphs = Array.from({ length: 24 }).map((_, i) => ({
      glyph: ['🎉', '🎊', '✨', '⭐', '🥳'][i % 5],
      size: 14 + (i % 10),
      offset: i * 4,
    }))
    return (
      <div className={`absolute inset-0 ${className}`} style={{ pointerEvents: 'none' }}>
        <FallingGlyphs items={glyphs} opacity={opacity} />
        <EventBanner message={message || 'Congratulations!'} accent="#f59e0b" />
      </div>
    )
  }

  if (type === 'hearts') {
    const glyphs = Array.from({ length: 20 }).map((_, i) => ({
      glyph: ['❤️', '💕', '💗', '✨'][i % 4],
      size: 14 + (i % 9),
      offset: i * 6,
    }))
    return (
      <div className={`absolute inset-0 ${className}`} style={{ pointerEvents: 'none' }}>
        <FallingGlyphs items={glyphs} opacity={opacity} />
        <EventBanner message={message} accent="#fb7185" />
      </div>
    )
  }

  if (type === 'anniversary') {
    const glyphs = Array.from({ length: 18 }).map((_, i) => ({
      glyph: ['🥂', '✨', '💎', '🌟'][i % 4],
      size: 14 + (i % 8),
      offset: i * 7,
    }))
    return (
      <div className={`absolute inset-0 ${className}`} style={{ pointerEvents: 'none' }}>
        <FallingGlyphs items={glyphs} opacity={opacity} />
        <EventBanner message={message || 'Happy Anniversary!'} accent="#a78bfa" />
      </div>
    )
  }

  if (type === 'vignette') {
    return (
      <div
        className={`absolute inset-0 ${className}`}
        style={{
          ...style,
          background:
            'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.55) 100%)',
        }}
        aria-hidden
      />
    )
  }

  if (type === 'dim') {
    return <div className={`absolute inset-0 bg-black ${className}`} style={style} aria-hidden />
  }

  if (type === 'soft-glow') {
    return (
      <div
        className={`absolute inset-0 ${className}`}
        style={{
          ...style,
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.35), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(139,197,63,0.18), transparent 50%)',
        }}
        aria-hidden
      />
    )
  }

  if (type === 'brand-wash') {
    return (
      <div
        className={`absolute inset-0 ${className}`}
        style={{
          ...style,
          background:
            'linear-gradient(135deg, rgba(139,197,63,0.22) 0%, transparent 45%, rgba(15,23,42,0.18) 100%)',
        }}
        aria-hidden
      />
    )
  }

  if (type === 'scanlines') {
    return (
      <div
        className={`absolute inset-0 ${className}`}
        style={{
          ...style,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
        }}
        aria-hidden
      />
    )
  }

  if (type === 'snowfall') {
    const glyphs = Array.from({ length: 28 }).map(() => ({ glyph: '❄', size: 10 }))
    return <FallingGlyphs items={glyphs} className={className} opacity={opacity} />
  }

  if (type === 'confetti') {
    const colors = ['#8bc53f', '#f59e0b', '#38bdf8', '#f472b6', '#a78bfa', '#f87171']
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`} style={style} aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="ps-confetti"
            style={{
              left: `${(i * 41) % 100}%`,
              backgroundColor: colors[i % colors.length],
              animationDelay: `${(i % 8) * 0.28}s`,
              animationDuration: `${4.5 + (i % 4)}s`,
              width: 6 + (i % 4),
              height: 8 + (i % 5),
            }}
          />
        ))}
        <EventBanner message={message} />
      </div>
    )
  }

  return null
}
