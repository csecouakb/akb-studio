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
    if (!targetScroller || event.touches.length !== 2) return
    refresh()
    if (!canvas) return
    pinchStartDistance = distance(event.touches)
    pinchStartWidth = canvas.getBoundingClientRect().width
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!scroller || !canvas || event.touches.length !== 2 || !pinchStartDistance) return
    const nextDistance = distance(event.touches)
    if (!nextDistance) return
    event.preventDefault()
    const relative = nextDistance / pinchStartDistance
    const nextFactor = clamp(zoomFactor * relative, 0.75, 4)
    const baseWidth = pinchStartWidth / Math.max(zoomFactor, 0.001)
    canvas.style.width = `${baseWidth * nextFactor}px`
    scroller.dataset.pinchZoom = nextFactor.toFixed(3)
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!canvas || event.touches.length >= 2 || !pinchStartDistance) return
    const value = Number(scroller?.dataset.pinchZoom)
    if (Number.isFinite(value) && value > 0) zoomFactor = value
    pinchStartDistance = 0
    pinchStartWidth = 0
  }

  const onPointerDownCapture = (event: PointerEvent) => {
    const audioClip = (event.target as Element | null)?.closest<HTMLButtonElement>('.audioClip')
    if (!audioClip || event.pointerType === 'mouse') return
    // On touch, prevent the current immediate-drag handler from moving audio by accident.
    // A tap still reaches the row click and selects Audio; timeline swipes remain native pan-x.
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    const onMove = (moveEvent: PointerEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 7) moved = true
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', cleanup, true)
      window.removeEventListener('pointercancel', cleanup, true)
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', cleanup, true)
    window.addEventListener('pointercancel', cleanup, true)
    if (moved) event.stopPropagation()
  }

  refresh()
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  document.addEventListener('pointerdown', onPointerDownCapture, true)

  return () => {
    observer.disconnect()
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
    document.removeEventListener('pointerdown', onPointerDownCapture, true)
  }
}
