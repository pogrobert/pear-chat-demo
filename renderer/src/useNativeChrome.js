import { useEffect } from 'react'

const bridge = window.bridge

// Mirrors the window's native state into CSS: which material is behind the
// page, the system accent color, and whether the window is key (focused).
export function useNativeChrome() {
  useEffect(() => {
    const root = document.documentElement
    const { platform, material, accent } = bridge.ui
    root.dataset.platform = platform
    root.dataset.material = material
    const setAccent = (color) => root.style.setProperty('--accent', color)
    setAccent(accent)

    const offAccent = bridge.onAccent(setAccent)
    const offFocus = bridge.onFocus((focused) => root.classList.toggle('inactive', !focused))
    return () => {
      offAccent()
      offFocus()
    }
  }, [])
}
