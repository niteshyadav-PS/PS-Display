/** Built-in profile avatars (served from /public/avatars). */
export const DEFAULT_AVATARS = [
  { id: 'sage', label: 'Sage', path: '/avatars/sage.svg' },
  { id: 'ocean', label: 'Ocean', path: '/avatars/ocean.svg' },
  { id: 'sunset', label: 'Sunset', path: '/avatars/sunset.svg' },
  { id: 'violet', label: 'Violet', path: '/avatars/violet.svg' },
  { id: 'slate', label: 'Slate', path: '/avatars/slate.svg' },
  { id: 'amber', label: 'Amber', path: '/avatars/amber.svg' },
]

export function isDefaultAvatar(url) {
  if (!url) return false
  return DEFAULT_AVATARS.some((a) => a.path === url || url.endsWith(a.path))
}
