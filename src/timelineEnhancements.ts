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
  let visualOffset = 0
  let lastScrollLeft = 0
  let smoothFrame = 0
  let audioSourceDelta: number | null = null
  let splitBeforeCount = 0
  let splitBeforeIndex = 0

  const refresh = () => {
    scroller = document.querySelector<HTMLDivElement>('.timelineScroller')
    canvas = document.querySelector<HTMLDivElement>('.timelineCanvas')
    video = document.querySelector<HTMLVideoElement>('video.sourceVideo')
    replacementAudio = document.querySelector<HTMLAudioElement>('.stage audio')

    if (scroller && !scroller.dataset.enhancedScroll) {
      scroller.dataset.enhancedScroll = '1'
      lastScrollLeft = scroller.scrollLeft
      scroller.addEventListener('scroll', onTimelineScroll, { passive: true })
    }

    const unlocked = document.querySelector<HTMLElement>('.videoClip.dragUnlocked')
    setDragLock(Boolean(unlocked))

    if (!autoSelectedOnce) {
      const firstVideoClip = document.querySelector<HTMLButtonElement>('.videoClip')
      if (firstVideoClip) {
        autoSelectedOnce = true
        firstVideoClip.click()
      }
    }
  }

  const setDragLock = (locked: boolean) => {
    if (dragLocked === locked) return
    dragLocked = locked
    scroller?.classList.toggle('dragLocked', locked)
  }

  const onTimelineScroll = () => {
    if (!scroller) return
    const next = scroller.scrollLeft
    const delta = next - lastScrollLeft
    lastScrollLeft = next

    // React intentionally updates scrollLeft only on media timeupdate events.
    // Cancel each small jump visually, then ease the canvas to the new position.
    if (video && !video.paused && !video.ended && !dragLocked && !pinchStartDistance && Math.abs(delta) > 0.25) {
      visualOffset += delta
      if (canvas) canvas.style.transform = `translate3d(${visualOffset}px,0,0)`
      startSmoothPlayback()
    }
  }

  const startSmoothPlayback = () => {
    if (smoothFrame) return
    let previous = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(40, now - previous)
      previous = now
      const response = 1 - Math.exp(-dt / 72)
      visualOffset += (0 - visualOffset) * response
      if (Math.abs(visualOffset) < 0.08) visualOffset = 0
      if (canvas) canvas.style.transform = visualOffset ? `translate3d(${visualOffset}px,0,0)` : ''

      if (visualOffset && video && !video.paused && !video.ended) smoothFrame = requestAnimationFrame(tick)
      else {
        smoothFrame = 0
        if (canvas && !pinchStartDistance) canvas.style.transform = ''
      }
    }
    smoothFrame = requestAnimationFrame(tick)
  }

  const onTouchStart = (event: TouchEvent) => {
    const targetScroller = (event.target as Element | null)?.closest<HTMLDivElement>('.timelineScroller')
    if (!targetScroller) return
    refresh()
    if (event.touches.length === 2 && canvas) {
      pinchStartDistance = distance(event.touches)
      pinchStartWidth = canvas.getBoundingClientRect().width
      if (smoothFrame) cancelAnimationFrame(smoothFrame)
      smoothFrame = 0
      visualOffset = 0
      canvas.style.transform = ''
    }
  }

  const onTouchMove = (event: TouchEvent) => {
    if (dragLocked) {
      // Once React's long-press unlocks a clip, the timeline itself must stay still.
      event.preventDefault()
      return
    }
    if (event.touches.length === 2 && scroller && canvas && pinchStartDistance) {
      const nextDistance = distance(event.touches)
      if (!nextDistance) return
      event.preventDefault()
      const relative = nextDistance / pinchStartDistance
      const nextFactor = clamp(zoomFactor * relative, 0.75, 4)
      const baseWidth = pinchStartWidth / Math.max(zoomFactor, 0.001)
      canvas.style.width = `${baseWidth * nextFactor}px`
      scroller.dataset.pinchZoom = nextFactor.toFixed(3)
    }
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (canvas && event.touches.length < 2 && pinchStartDistance) {
      const value = Number(scroller?.dataset.pinchZoom)
      if (Number.isFinite(value) && value > 0) zoomFactor = value
      pinchStartDistance = 0
      pinchStartWidth = 0
    }
  }

  const parsePercent = (value: string) => {
    const number = Number.parseFloat(value || '0')
    return Number.isFinite(number) ? number : 0
  }

  const shouldSourceLockAudio = () => {
    const audioClip = document.querySelector<HTMLElement>('.audioClip')
    if (!audioClip) return false
    // Source-lock only a track placed at the beginning. Tracks deliberately placed later keep app timing.
    return parsePercent(audioClip.style.left) < 0.5
  }

  const captureAudioSourceDelta = () => {
    refresh()
    if (!video || !replacementAudio || !shouldSourceLockAudio()) {
      audioSourceDelta = null
      return
    }
    requestAnimationFrame(() => {
      if (!video || !replacementAudio) return
      audioSourceDelta = replacementAudio.currentTime - video.currentTime
    })
  }

  const keepAudioWithVideoCuts = () => {
    if (!video || !replacementAudio || audioSourceDelta === null || !shouldSourceLockAudio()) return
    requestAnimationFrame(() => {
      if (!video || !replacementAudio || audioSourceDelta === null) return
      const wanted = clamp(video.currentTime + audioSourceDelta, 0, replacementAudio.duration || Number.MAX_SAFE_INTEGER)
      // Normal playback stays untouched; only correct meaningful drift such as a deleted video section.
      if (Math.abs(replacementAudio.currentTime - wanted) > 0.22) replacementAudio.currentTime = wanted
      if (!video.paused && replacementAudio.paused && wanted < (replacementAudio.duration || Infinity)) void replacementAudio.play().catch(() => undefined)
    })
  }

  const selectedVideoIndex = () => {
    const clips = [...document.querySelectorAll<HTMLElement>('.videoClip')]
    const selected = document.querySelector<HTMLElement>('.videoClip.selected')
    const index = selected ? clips.indexOf(selected) : -1
    return Math.max(0, index)
  }

  const isButtonNamed = (target: EventTarget | null, name: string) => {
    const button = (target as Element | null)?.closest<HTMLButtonElement>('button')
    return button && button.textContent?.trim().toLowerCase().includes(name.toLowerCase()) ? button : null
  }

  const onClickCapture = (event: MouseEvent) => {
    if (isButtonNamed(event.target, 'Split')) {
      splitBeforeCount = document.querySelectorAll('.videoClip').length
      splitBeforeIndex = selectedVideoIndex()
    }
  }

  const onClickBubble = (event: MouseEvent) => {
    if (!isButtonNamed(event.target, 'Split')) return
    // After React inserts the new half, keep the half after the playhead selected.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const clips = [...document.querySelectorAll<HTMLButtonElement>('.videoClip')]
      if (clips.length === splitBeforeCount + 1) {
        const rightHalf = clips[Math.min(splitBeforeIndex + 1, clips.length - 1)]
        rightHalf?.click()
      }
    }))
  }

  const onVideoPlay = () => {
    visualOffset = 0
    if (canvas) canvas.style.transform = ''
    captureAudioSourceDelta()
  }

  const onVideoPause = () => {
    if (smoothFrame) cancelAnimationFrame(smoothFrame)
    smoothFrame = 0
    visualOffset = 0
    if (canvas) canvas.style.transform = ''
  }

  const onVideoTimeUpdate = () => {
    keepAudioWithVideoCuts()
  }

  refresh()
  if (video) {
    video.addEventListener('play', onVideoPlay)
    video.addEventListener('pause', onVideoPause)
    video.addEventListener('timeupdate', onVideoTimeUpdate)
  }

  const observer = new MutationObserver(() => {
    const previousVideo = video
    refresh()
    if (video && video !== previousVideo) {
      video.addEventListener('play', onVideoPlay)
      video.addEventListener('pause', onVideoPause)
      video.addEventListener('timeupdate', onVideoTimeUpdate)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  document.addEventListener('click', onClickCapture, true)
  document.addEventListener('click', onClickBubble, false)

  return () => {
    observer.disconnect()
    if (smoothFrame) cancelAnimationFrame(smoothFrame)
    scroller?.removeEventListener('scroll', onTimelineScroll)
    video?.removeEventListener('play', onVideoPlay)
    video?.removeEventListener('pause', onVideoPause)
    video?.removeEventListener('timeupdate', onVideoTimeUpdate)
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchmove', onTouchMove, true)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
    document.removeEventListener('click', onClickCapture, true)
    document.removeEventListener('click', onClickBubble, false)
  }
}
