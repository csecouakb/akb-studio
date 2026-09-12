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
  let pinchStartDistance = 0
  let pinchStartWidth = 0
  let zoomFactor = 1
  let autoSelectedOnce = false
  let holdTimer: number | null = null
  let heldClip: HTMLElement | null = null
  let holdStartX = 0
  let holdStartY = 0
  let dragLocked = false

  const refresh = () => {
    scroller = document.querySelector<HTMLDivElement>('.timelineScroller')
    canvas = document.querySelector<HTMLDivElement>('.timelineCanvas')

    if (!autoSelectedOnce) {
      const firstVideoClip = document.querySelector<HTMLButtonElement>('.videoClip')
      if (firstVideoClip) {
        autoSelectedOnce = true
        firstVideoClip.click()
      }
    }
  }

  const onTouchStart = (event: TouchEvent) => {
    const targetScroller = (event.target as Element | null)?.closest<HTMLDivElement>('.timelineScroller')
    if (!targetScroller) return
    refresh()

    if (event.touches.length === 2 && canvas) {
      pinchStartDistance = distance(event.touches)
      pinchStartWidth = canvas.getBoundingClientRect().width
      return
    }

    const clip = (event.target as Element | null)?.closest<HTMLElement>('.videoClip')
    if (!clip || event.touches.length !== 1) return
    const touch = event.touches[0]
    heldClip = clip
    holdStartX = touch.clientX
    holdStartY = touch.clientY
    holdTimer = window.setTimeout(() => {
      dragLocked = true
      scroller?.classList.add('dragLocked')
      heldClip?.classList.add('dragUnlocked')
      navigator.vibrate?.(25)
    }, 400)
  }

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2 && scroller && canvas && pinchStartDistance) {
      const nextDistance = distance(event.touches)
      if (!nextDistance) return
      event.preventDefault()
      const relative = nextDistance / pinchStartDistance
      const nextFactor = clamp(zoomFactor * relative, 0.75, 4)
      const baseWidth = pinchStartWidth / Math.max(zoomFactor, 0.001)
      canvas.style.width = `${baseWidth * nextFactor}px`
      scroller.dataset.pinchZoom = nextFactor.toFixed(3)
      return
    }

    if (!heldClip || event.touches.length !== 1) return
    const touch = event.touches[0]
    const moved = Math.hypot(touch.clientX - holdStartX, touch.clientY - holdStartY)
    if (!dragLocked && moved > 8 && holdTimer !== null) {
      window.clearTimeout(holdTimer)
      holdTimer = null
      heldClip = null
      return
    }
    if (dragLocked) event.preventDefault()
  }

  const releaseHold = () => {
    if (holdTimer !== null) window.clearTimeout(holdTimer)
    holdTimer = null
    dragLocked = false
    scroller?.classList.remove('dragLocked')
    heldClip?.classList.remove('dragUnlocked')
    heldClip = null
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (canvas && event.touches.length < 2 && pinchStartDistance) {
      const value = Number(scroller?.dataset.pinchZoom)
      if (Number.isFinite(value) && value > 0) zoomFactor = value
      pinchStartDistance = 0
      pinchStartWidth = 0
    }
    if (event.touches.length === 0) releaseHold()
  }

  refresh()
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })

  return () => {
    observer.disconnect()
    releaseHold()
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
  }
}
