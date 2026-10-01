/** True when the document (or an element) is in browser fullscreen. */
export function isFullscreen() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
  )
}

export async function enterFullscreen(el = document.documentElement) {
  const target = el || document.documentElement
  try {
    if (target.requestFullscreen) await target.requestFullscreen()
    else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen()
    else if (target.msRequestFullscreen) await target.msRequestFullscreen()
  } catch {
    // Browser may require a direct user gesture; caller shows a tap prompt.
  }
}

export async function exitFullscreen() {
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
    else if (document.msExitFullscreen) await document.msExitFullscreen()
  } catch {
    // ignore
  }
}

export async function toggleFullscreen(el = document.documentElement) {
  if (isFullscreen()) await exitFullscreen()
  else await enterFullscreen(el)
}
