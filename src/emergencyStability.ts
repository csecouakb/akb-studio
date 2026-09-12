const nativeRaf = window.requestAnimationFrame.bind(window)
const nativeCancelRaf = window.cancelAnimationFrame.bind(window)
const nativeSetTimeout = window.setTimeout.bind(window)
const nativeClearTimeout = window.clearTimeout.bind(window)

// AKB Studio's preview renderer continuously paints the imported video to canvas.
// On some Windows/Chrome machines a large phone video can saturate the main thread.
// Keep the editor responsive by capping app animation-frame work to about 10fps for now.
let nextFrameId = 1
const pendingFrames = new Map<number, { timeoutId: number; rafId?: number }>()

window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  const id = nextFrameId++
  const timeoutId = nativeSetTimeout(() => {
    const rafId = nativeRaf(timestamp => {
      pendingFrames.delete(id)
      callback(timestamp)
    })
    const pending = pendingFrames.get(id)
    if (pending) pending.rafId = rafId
  }, 100)
  pendingFrames.set(id, { timeoutId })
  return id
}

window.cancelAnimationFrame = (id: number) => {
  const pending = pendingFrames.get(id)
  if (!pending) {
    nativeCancelRaf(id)
    return
  }
  nativeClearTimeout(pending.timeoutId)
  if (pending.rafId !== undefined) nativeCancelRaf(pending.rafId)
  pendingFrames.delete(id)
}

// Selecting the same video twice must still fire React's onChange handler.
document.addEventListener('click', event => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.type === 'file') target.value = ''
}, true)

// Remove any stale PWA worker/cache left by older deployments. This does not reload the page.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations =>
    Promise.all(registrations.map(registration => registration.unregister()))
  ).catch(() => undefined)
}
if ('caches' in window) {
  void caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => undefined)
}
