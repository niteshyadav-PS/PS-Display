/** Soft direction hint for page enter animations (forward | back). */
let pendingDir = 'forward'

export function setNavDir(dir = 'forward') {
  pendingDir = dir === 'back' ? 'back' : 'forward'
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.navDir = pendingDir
  }
}

export function consumeNavDir() {
  const dir = pendingDir
  pendingDir = 'forward'
  return dir
}
