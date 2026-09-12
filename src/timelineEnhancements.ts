const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const installTimelineEnhancements = () => {
  let thumbStrip = ''
  let thumbSource = ''
  let generating = false
  let pinchStartDistance = 0
  let pinchStartZoom = 1

  const distance = (touches: TouchList) => {
    if (touches.length < 2) return 0
    const a = touches[0]
    const b = touches[1]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const installHistoryButtons = () => {
    const header = document.querySelector<HTMLElement>('.timelineHeader')
    if (!header || header.querySelector('.timelineHistory')) return
    const host = document.createElement('div')
    host.className = 'timelineHistory'
    host.innerHTML = `
      <button type="button" class="timelineUndo" aria-label="Undo" title="Undo">↶</button>
      <button type="button" class="timelineRedo" aria-label="Redo" title="Redo">↷</button>`
    const buttons = host.querySelectorAll<HTMLButtonElement>('button')
    buttons[0]?.addEventListener('click', () => document.querySelectorAll<HTMLButtonElement>('.historyActions button')[0]?.click())
    buttons[1]?.addEventListener('click', () => document.querySelectorAll<HTMLButtonElement>('.historyActions button')[1]?.click())
    const zoom = header.querySelector('label')
    if (zoom) header.insertBefore(host, zoom)
    else header.appendChild(host)
  }

  const syncHistory = () => {
    const source = document.querySelectorAll<HTMLButtonElement>('.historyActions button')
    const undo = document.querySelector<HTMLButtonElement>('.timelineUndo')
    const redo = document.querySelector<HTMLButtonElement>('.timelineRedo')
    if (undo) undo.disabled = source[0]?.disabled ?? true
    if (redo) redo.disabled = source[1]?.disabled ?? true
  }

  const applyThumbnails = () => {
    if (!thumbStrip) return
    document.querySelectorAll<HTMLElement>('.videoClip').forEach(clip => {
      clip.style.setProperty('--akb-thumb-strip', `url("${thumbStrip}")`)
      clip.classList.add('hasThumbs')
    })
  }

  const seekVideo = (video: HTMLVideoElement, time: number) => new Promise<void>(resolve => {
    const done = () => resolve()
    video.addEventListener('seeked', done, { once: true })
    video.currentTime = clamp(time, 0, Math.max(0, video.duration - 0.02))
  })

  const generateThumbnails = async () => {
    const source = document.querySelector<HTMLVideoElement>('video.sourceVideo')
    if (!source?.src || generating || source.src === thumbSource) return
    thumbSource = source.src
    generating = true
    try {
      const video = document.createElement('video')
      video.src = source.src
      video.muted = true
      video.preload = 'auto'
      video.playsInline = true
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('thumbnail video load failed')), { once: true })
      })
      const count = 10
      const cellW = 84
      const cellH = 48
      const strip = document.createElement('canvas')
      strip.width = cellW * count
      strip.height = cellH
      const context = strip.getContext('2d')
      if (!context || !Number.isFinite(video.duration) || video.duration <= 0) return
      for (let i = 0; i < count; i += 1) {
        const time = video.duration * (i + .5) / count
        await seekVideo(video, time)
        const sw = video.videoWidth || 1
        const sh = video.videoHeight || 1
        const scale = Math.max(cellW / sw, cellH / sh)
        const dw = sw * scale
        const dh = sh * scale
        context.drawImage(video, i * cellW + (cellW - dw) / 2, (cellH - dh) / 2, dw, dh)
      }
      thumbStrip = strip.toDataURL('image/jpeg', .72)
      applyThumbnails()
      video.removeAttribute('src')
      video.load()
    } catch {
      /* Timeline stays fully usable even if thumbnail extraction fails. */
    } finally {
      generating = false
    }
  }

  const syncZoomFromPinch = (event: TouchEvent) => {
    const target = event.target as Element | null
    if (!target?.closest('.timelineScroller')) return
    const zoom = document.querySelector<HTMLInputElement>('.timelineHeader input[type="range"]')
    if (!zoom) return
    if (event.type === 'touchstart' && event.touches.length === 2) {
      pinchStartDistance = distance(event.touches)
      pinchStartZoom = Number(zoom.value) || 1
      return
    }
    if (event.type === 'touchmove' && event.touches.length === 2 && pinchStartDistance > 0) {
      event.preventDefault()
      const ratio = distance(event.touches) / pinchStartDistance
      const min = Number(zoom.min) || 1
      const max = Number(zoom.max) || 4
      const next = clamp(pinchStartZoom * ratio, min, max)
      zoom.value = String(next)
      zoom.dispatchEvent(new Event('input', { bubbles: true }))
      zoom.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if ((event.type === 'touchend' || event.type === 'touchcancel') && event.touches.length < 2) pinchStartDistance = 0
  }

  const refresh = () => {
    installHistoryButtons()
    syncHistory()
    applyThumbnails()
    void generateThumbnails()
  }

  refresh()
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'src'] })
  document.addEventListener('touchstart', syncZoomFromPinch, { passive: true })
  document.addEventListener('touchmove', syncZoomFromPinch, { passive: false })
  document.addEventListener('touchend', syncZoomFromPinch, { passive: true })
  document.addEventListener('touchcancel', syncZoomFromPinch, { passive: true })

  return () => {
    observer.disconnect()
    document.removeEventListener('touchstart', syncZoomFromPinch)
    document.removeEventListener('touchmove', syncZoomFromPinch)
    document.removeEventListener('touchend', syncZoomFromPinch)
    document.removeEventListener('touchcancel', syncZoomFromPinch)
  }
}
