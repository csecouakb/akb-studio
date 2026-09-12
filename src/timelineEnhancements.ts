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
  let splitBeforeCount = 0
  let splitBeforeIndex = 0
  let lastTappedVideoIndex = 0
  let replayingToolbarAction = false

  const setDragLock = (locked: boolean) => {
    if (!scroller) return
    if (locked && !dragLocked) dragLockScrollLeft = scroller.scrollLeft
    dragLocked = locked
    scroller.classList.toggle('dragLocked', locked)
    if (locked) scroller.scrollLeft = dragLockScrollLeft
  }

  const installHistoryButtons = () => {
    const timeline = document.querySelector<HTMLElement>('.studioTimeline')
    if (!timeline || timeline.querySelector('.timelineHistory')) return
    const host = document.createElement('div')
    host.className = 'timelineHistory'
    host.innerHTML = `
      <button type="button" class="timelineUndo" aria-label="Undo" title="Undo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 1 1 0 12"/></svg>
      </button>
      <button type="button" class="timelineRedo" aria-label="Redo" title="Redo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M19 12h-8a6 6 0 1 0 0 12"/></svg>
      </button>`
    host.querySelector<HTMLButtonElement>('.timelineUndo')?.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.historyActions button')[0]?.click()
    })
    host.querySelector<HTMLButtonElement>('.timelineRedo')?.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.historyActions button')[1]?.click()
    })
    timeline.appendChild(host)
  }

  const refresh = () => {
    scroller = document.querySelector<HTMLDivElement>('.timelineScroller')
    canvas = document.querySelector<HTMLDivElement>('.timelineCanvas')
    video = document.querySelector<HTMLVideoElement>('video.sourceVideo')
    replacementAudio = document.querySelector<HTMLAudioElement>('.stage audio')
    installHistoryButtons()

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

  const onTimelineScroll = () => {
    if (!scroller) return
    if (dragLocked) {
      scroller.scrollLeft = dragLockScrollLeft
      lastScrollLeft = dragLockScrollLeft
      return
    }
    const next = scroller.scrollLeft
    const delta = next - lastScrollLeft
    lastScrollLeft = next
    if (video && !video.paused && !video.ended && !pinchStartDistance && Math.abs(delta) > 0.25) {
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
      event.preventDefault()
      if (scroller) scroller.scrollLeft = dragLockScrollLeft
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
      if (Math.abs(replacementAudio.currentTime - wanted) > 0.22) replacementAudio.currentTime = wanted
      if (!video.paused && replacementAudio.paused && wanted < (replacementAudio.duration || Infinity)) void replacementAudio.play().catch(() => undefined)
    })
  }

  const videoClips = () => [...document.querySelectorAll<HTMLButtonElement>('.videoClip')]

  const selectedVideoIndex = () => {
    const clips = videoClips()
    const selected = document.querySelector<HTMLButtonElement>('.videoClip.selected')
    const index = selected ? clips.indexOf(selected) : -1
    return index >= 0 ? index : clamp(lastTappedVideoIndex, 0, Math.max(0, clips.length - 1))
  }

  const clipUnderPlayhead = () => {
    const playhead = document.querySelector<HTMLElement>('.fixedPlayhead')
    const clips = videoClips()
    if (!playhead || !clips.length) return null
    const x = playhead.getBoundingClientRect().left + 1
    const hit = clips.find(clip => {
      const rect = clip.getBoundingClientRect()
      return x >= rect.left - 2 && x <= rect.right + 2
    })
    return hit ?? clips[clamp(lastTappedVideoIndex, 0, clips.length - 1)] ?? null
  }

  const isButtonNamed = (target: EventTarget | null, name: string) => {
    const button = (target as Element | null)?.closest<HTMLButtonElement>('button')
    return button && button.textContent?.trim().toLowerCase().includes(name.toLowerCase()) ? button : null
  }

  const replayAfterSelecting = (button: HTMLButtonElement, clip: HTMLButtonElement) => {
    const clips = videoClips()
    const index = clips.indexOf(clip)
    if (index >= 0) lastTappedVideoIndex = index
    replayingToolbarAction = true
    clip.click()
    requestAnimationFrame(() => {
      button.click()
      requestAnimationFrame(() => { replayingToolbarAction = false })
    })
  }

  const onPointerDownCapture = (event: PointerEvent) => {
    const clip = (event.target as Element | null)?.closest<HTMLButtonElement>('.videoClip')
    if (!clip) return
    const index = videoClips().indexOf(clip)
    if (index >= 0) lastTappedVideoIndex = index
  }

  const onClickCapture = (event: MouseEvent) => {
    const splitButton = isButtonNamed(event.target, 'Split')
    if (splitButton && !replayingToolbarAction) {
      const targetClip = clipUnderPlayhead()
      if (targetClip && !targetClip.classList.contains('selected')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        replayAfterSelecting(splitButton, targetClip)
        return
      }
      splitBeforeCount = videoClips().length
      splitBeforeIndex = selectedVideoIndex()
      return
    }

    const deleteButton = isButtonNamed(event.target, 'Delete')
    if (deleteButton && !replayingToolbarAction) {
      const clips = videoClips()
      const targetClip = clips[clamp(lastTappedVideoIndex, 0, Math.max(0, clips.length - 1))]
      if (targetClip && !targetClip.classList.contains('selected')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        replayAfterSelecting(deleteButton, targetClip)
      }
    }
  }

  const onClickBubble = (event: MouseEvent) => {
    if (!isButtonNamed(event.target, 'Split')) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const clips = videoClips()
      if (clips.length === splitBeforeCount + 1) {
        const rightIndex = Math.min(splitBeforeIndex + 1, clips.length - 1)
        lastTappedVideoIndex = rightIndex
        clips[rightIndex]?.click()
        clips[rightIndex]?.classList.add('justSplit')
        window.setTimeout(() => clips[rightIndex]?.classList.remove('justSplit'), 700)
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

  const onVideoTimeUpdate = () => keepAudioWithVideoCuts()

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
  document.addEventListener('pointerdown', onPointerDownCapture, true)
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
    document.removeEventListener('pointerdown', onPointerDownCapture, true)
    document.removeEventListener('click', onClickCapture, true)
    document.removeEventListener('click', onClickBubble, false)
  }
}
