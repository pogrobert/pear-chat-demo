import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { SIDEBAR, clampSidebar, useSaved } from './state/saved.ts'

// The sidebar's right edge. Drag it to resize; drag it far enough left and the
// sidebar collapses, like Finder and Mail. It is also a focusable separator,
// so the arrow keys resize it from the keyboard.
export default function Resizer({ onCollapse }: { onCollapse(): void }) {
  const width = useSaved((s) => s.sidebarWidth)
  const setWidth = useSaved((s) => s.setSidebarWidth)
  const drag = useRef<{ x: number; width: number } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width }
    document.documentElement.classList.add('resizing')
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const next = drag.current.width + event.clientX - drag.current.x
    if (next < SIDEBAR.collapseBelow) {
      setWidth(drag.current.width) // reopen at the width it had before the drag
      stop()
      onCollapse()
      return
    }
    setWidth(next)
  }

  function stop() {
    drag.current = null
    document.documentElement.classList.remove('resizing')
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 40 : 10
    if (event.key === 'ArrowLeft') setWidth(width - step)
    if (event.key === 'ArrowRight') setWidth(width + step)
  }

  return (
    <div
      className='resizer'
      role='separator'
      aria-orientation='vertical'
      aria-label='Resize sidebar'
      aria-valuemin={SIDEBAR.min}
      aria-valuemax={SIDEBAR.max}
      aria-valuenow={clampSidebar(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => setWidth(SIDEBAR.default)}
      onKeyDown={onKeyDown}
    />
  )
}
