import { useEffect, useState } from 'react'

// Keeps something mounted for `ms` after it is hidden, so it can animate out
// the way it came in. Returns [mounted, state] where state is 'open' or 'closing'.
export function usePresence(open, ms = 200) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) return setMounted(true)
    const timer = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(timer)
  }, [open, ms])
  return [mounted || open, open ? 'open' : 'closing']
}
