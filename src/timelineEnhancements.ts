const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const distance = (touches: TouchList) => {
  if (touches.length < 2) return 0
  const a = touches[0]
  const b = touches[1]
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export const installTimelineEnhancements = () => {
  let scroller: HTMLDivElement | null = null
  let canvas: HTMLDivElement | null = null
  let video: HTMLVideoElement | null = null
  let replacementAudio: HTMLAudioElement | null = null
  let pinchStartDistance = 0
  let pinchStartWidth = 0
  let zoomFactor = 1
  let autoSelectedOnce = false
  let dragLocked = false
  let dragLockScrollLeft = 0
  let visualOffset = 0
  let lastScrollLeft = 0
  let smoothFrame = 0
  let audioSourceDelta: number | null = null
  let forwardingAction = false
  let lastSelectedClip: HTMLButtonElement | null = null

  const setDragLock = (locked: boolean) => {
    if (!scroller) return
    if (locked && !dragLocked) dragLockScrollLeft = scroller.scrollLeft
    dragLocked = locked
    scroller.classList.toggle('dragLocked', locked)
    if (locked) scroller.scrollLeft = dragLockScrollLeft
  }

  const installHistoryButtons = () => {
    const header = document.querySelector<HTMLElement>('.timelineHeader')
    if (!header || header.querySelector('.timelineHistory')) return
    const host = document.createElement('div')
    host.className = 'timelineHistory'
    host.innerHTML = `
      <button type="button" class="timelineUndo" aria-label="Undo" title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 1 1 0 12"/></svg></button>
      <button type="button" class="timelineRedo" aria-label="Redo" title="Redo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M19 12h-8a6 6 0 1 0 0 12"/></svg></button>`
    host.querySelector<HTMLButtonElement>('.timelineUndo')?.addEventListener('click', () => document.querySelectorAll<HTMLButtonElement>('.historyActions button')[0]?.click())
    host.querySelector<HTMLButtonElement>('.timelineRedo')?.addEventListener('click', () => document.querySelectorAll<HTMLButtonElement>('.historyActions button')[1]?.click())
    const zoom = header.querySelector('label')
    if (zoom) header.insertBefore(host, zoom)
    else header.appendChild(host)
  }

  const syncHistoryDisabledState = () => {
    const originals = document.querySelectorAll<HTMLButtonElement>('.historyActions button')
    const undo = document.querySelector<HTMLButtonElement>('.timelineUndo')
    const redo = document.querySelector<HTMLButtonElement>('.timelineRedo')
    if (undo && originals[0]) undo.disabled = originals[0].disabled
    if (redo && originals[1]) redo.disabled = originals[1].disabled
  }

  const refresh = () => {
    scroller = document.querySelector<HTMLDivElement>('.timelineScroller')
    canvas = document.querySelector<HTMLDivElement>('.timelineCanvas')
    video = document.querySelector<HTMLVideoElement>('video.sourceVideo')
    replacementAudio = document.querySelector<HTMLAudioElement>('.stage audio')
    installHistoryButtons()
    syncHistoryDisabledState()
    const selected = document.querySelector<HTMLButtonElement>('.videoClip.selected')
    if (selected) lastSelectedClip = selected
    if (scroller && !scroller.dataset.enhancedScroll) {
      scroller.dataset.enhancedScroll = '1'
      lastScrollLeft = scroller.scrollLeft
      scroller.addEventListener('scroll', onTimelineScroll, { passive: true })
    }
    setDragLock(Boolean(document.querySelector<HTMLElement>('.videoClip.dragUnlocked')))
    if (!autoSelectedOnce) {
      const firstVideoClip = document.querySelector<HTMLButtonElement>('.videoClip')
      if (firstVideoClip) { autoSelectedOnce = true; firstVideoClip.click(); lastSelectedClip = firstVideoClip }
    }
  }

  const onTimelineScroll = () => {
    if (!scroller) return
    if (dragLocked) { scroller.scrollLeft = dragLockScrollLeft; lastScrollLeft = dragLockScrollLeft; return }
    const next = scroller.scrollLeft
    const delta = next - lastScrollLeft
    lastScrollLeft = next
    if (video && !video.paused && !video.ended && !pinchStartDistance && Math.abs(delta) > .25) {
      visualOffset += delta
      if (canvas) canvas.style.transform = `translate3d(${visualOffset}px,0,0)`
      startSmoothPlayback()
    }
  }

  const startSmoothPlayback = () => {
    if (smoothFrame) return
    let previous = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(40, now - previous); previous = now
      visualOffset += (0 - visualOffset) * (1 - Math.exp(-dt / 72))
      if (Math.abs(visualOffset) < .08) visualOffset = 0
      if (canvas) canvas.style.transform = visualOffset ? `translate3d(${visualOffset}px,0,0)` : ''
      if (visualOffset && video && !video.paused && !video.ended) smoothFrame = requestAnimationFrame(tick)
      else { smoothFrame = 0; if (canvas && !pinchStartDistance) canvas.style.transform = '' }
    }
    smoothFrame = requestAnimationFrame(tick)
  }

  const onTouchStart = (event: TouchEvent) => {
    if (!(event.target as Element | null)?.closest('.timelineScroller')) return
    refresh()
    if (event.touches.length === 2 && canvas) {
      pinchStartDistance = distance(event.touches); pinchStartWidth = canvas.getBoundingClientRect().width
      if (smoothFrame) cancelAnimationFrame(smoothFrame)
      smoothFrame = 0; visualOffset = 0; canvas.style.transform = ''
    }
  }

  const onTouchMove = (event: TouchEvent) => {
    if (dragLocked) { event.preventDefault(); if (scroller) scroller.scrollLeft = dragLockScrollLeft; return }
    if (event.touches.length === 2 && scroller && canvas && pinchStartDistance) {
      const nextDistance = distance(event.touches); if (!nextDistance) return
      event.preventDefault()
      const nextFactor = clamp(zoomFactor * nextDistance / pinchStartDistance, .75, 4)
      const baseWidth = pinchStartWidth / Math.max(zoomFactor, .001)
      canvas.style.width = `${baseWidth * nextFactor}px`; scroller.dataset.pinchZoom = nextFactor.toFixed(3)
    }
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (canvas && event.touches.length < 2 && pinchStartDistance) {
      const value = Number(scroller?.dataset.pinchZoom); if (Number.isFinite(value) && value > 0) zoomFactor = value
      pinchStartDistance = 0; pinchStartWidth = 0
    }
  }

  const parsePercent = (value: string) => { const n = Number.parseFloat(value || '0'); return Number.isFinite(n) ? n : 0 }
  const shouldSourceLockAudio = () => { const clip = document.querySelector<HTMLElement>('.audioClip'); return Boolean(clip && parsePercent(clip.style.left) < .5) }

  const captureAudioSourceDelta = () => {
    refresh()
    if (!video || !replacementAudio || !shouldSourceLockAudio()) { audioSourceDelta = null; return }
    requestAnimationFrame(() => { if (video && replacementAudio) audioSourceDelta = replacementAudio.currentTime - video.currentTime })
  }

  const keepAudioWithVideoCuts = () => {
    if (!video || !replacementAudio || audioSourceDelta === null || !shouldSourceLockAudio()) return
    requestAnimationFrame(() => {
      if (!video || !replacementAudio || audioSourceDelta === null) return
      const wanted = clamp(video.currentTime + audioSourceDelta, 0, replacementAudio.duration || Number.MAX_SAFE_INTEGER)
      if (Math.abs(replacementAudio.currentTime - wanted) > .22) replacementAudio.currentTime = wanted
      if (!video.paused && replacementAudio.paused && wanted < (replacementAudio.duration || Infinity)) void replacementAudio.play().catch(() => undefined)
    })
  }

  const isActionButton = (target: Element | null, text: string) => {
    const button = target?.closest<HTMLButtonElement>('button')
    return button && button.textContent?.trim().toLowerCase().includes(text)
  }

  const onClickCapture = (event: MouseEvent) => {
    const target = event.target as Element | null
    const clip = target?.closest<HTMLButtonElement>('.videoClip')
    if (clip) lastSelectedClip = clip
    if (forwardingAction) return

    const splitButton = isActionButton(target, 'split')
    const deleteButton = isActionButton(target, 'delete')
    if (!splitButton && !deleteButton) return

    const button = target?.closest<HTMLButtonElement>('button')
    if (!button || button.disabled) return
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()

    const selected = document.querySelector<HTMLButtonElement>('.videoClip.selected') || lastSelectedClip
    selected?.click()
    if (splitButton && scroller) scroller.dispatchEvent(new Event('scroll', { bubbles: true }))

    requestAnimationFrame(() => requestAnimationFrame(() => {
      forwardingAction = true
      button.click()
      forwardingAction = false
      if (splitButton) {
        requestAnimationFrame(() => {
          const clips = [...document.querySelectorAll<HTMLButtonElement>('.videoClip')]
          const newest = clips.find(item => item !== selected && item.classList.contains('selected')) || clips[Math.min(clips.length - 1, Math.max(1, clips.indexOf(selected as HTMLButtonElement) + 1))]
          newest?.classList.add('justSplit')
          window.setTimeout(() => newest?.classList.remove('justSplit'), 700)
        })
      }
    }))
  }

  const onVideoPlay = () => { visualOffset = 0; if (canvas) canvas.style.transform = ''; captureAudioSourceDelta() }
  const onVideoPause = () => { if (smoothFrame) cancelAnimationFrame(smoothFrame); smoothFrame = 0; visualOffset = 0; if (canvas) canvas.style.transform = '' }
  const onVideoTimeUpdate = () => keepAudioWithVideoCuts()

  refresh()
  if (video) { video.addEventListener('play', onVideoPlay); video.addEventListener('pause', onVideoPause); video.addEventListener('timeupdate', onVideoTimeUpdate) }
  const observer = new MutationObserver(() => {
    const previousVideo = video; refresh()
    if (video && video !== previousVideo) { video.addEventListener('play', onVideoPlay); video.addEventListener('pause', onVideoPause); video.addEventListener('timeupdate', onVideoTimeUpdate) }
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] })
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  document.addEventListener('click', onClickCapture, true)

  return () => {
    observer.disconnect(); if (smoothFrame) cancelAnimationFrame(smoothFrame)
    scroller?.removeEventListener('scroll', onTimelineScroll)
    video?.removeEventListener('play', onVideoPlay); video?.removeEventListener('pause', onVideoPause); video?.removeEventListener('timeupdate', onVideoTimeUpdate)
    document.removeEventListener('touchstart', onTouchStart); document.removeEventListener('touchmove', onTouchMove, true); document.removeEventListener('touchend', onTouchEnd); document.removeEventListener('touchcancel', onTouchEnd)
    document.removeEventListener('click', onClickCapture, true)
  }
}
