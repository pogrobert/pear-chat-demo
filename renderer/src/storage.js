// Small per-device settings (display name, last room). localStorage can throw
// in locked-down contexts, so every access is guarded.
export function load(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function save(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {}
}
