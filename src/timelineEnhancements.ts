export const installTimelineEnhancements = () => {
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

  const refresh = () => {
    installHistoryButtons()
    syncHistory()
  }

  refresh()
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })

  return () => observer.disconnect()
}
