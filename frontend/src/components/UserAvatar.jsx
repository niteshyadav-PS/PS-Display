import { resolveMediaUrl } from '../lib/api'

/**
 * Simple circular profile avatar for header / sidebar.
 */
export default function UserAvatar({ user, size = 36, ring = false, className = '' }) {
  const src = user?.avatar ? resolveMediaUrl(user.avatar) : ''
  const initial = (user?.name || user?.email || 'U').trim().slice(0, 1).toUpperCase()
  const px = typeof size === 'number' ? `${size}px` : size

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand font-semibold text-gray-900 ${
        ring ? 'ring-2 ring-white/15' : ''
      } ${className}`}
      style={{
        width: px,
        height: px,
        fontSize: Math.max(12, Math.round((parseInt(size, 10) || 36) * 0.38)),
      }}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  )
}
