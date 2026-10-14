import { useEffect, useState } from 'react'

// Mirrors the window's native state into CSS: the platform, the system accent
// color, and whether the window is key (focused).
export function useNativeChrome() {
  useEffect(() => {
    const root = document.documentElement
    const { platform, accent } = window.bridge.ui
    root.dataset.platform = platform
    const setAccent = (color: string) => root.style.setProperty('--accent', color)
    setAccent(accent)

    const offAccent = window.bridge.onAccent(setAccent)
    const offFocus = window.bridge.onFocus((focused) => root.classList.toggle('inactive', !focused))
    return () => {
      offAccent()
      offFocus()
    }
  }, [])
}

// Keeps something mounted for `ms` after it is hidden, so it can animate out
// the way it came in.
export function usePresence(open: boolean, ms = 200): [boolean, 'open' | 'closing'] {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) return setMounted(true)
    const timer = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(timer)
  }, [open, ms])
  return [mounted || open, open ? 'open' : 'closing']
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}
