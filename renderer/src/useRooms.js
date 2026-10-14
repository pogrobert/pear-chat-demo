import { useCallback, useState } from 'react'
import { load, save } from './storage.js'

// Rooms this device has been in, newest activity first, so the sidebar can
// list them like conversations. Stored locally; peers never see it.
export function useRooms() {
  const [rooms, setRooms] = useState(() => {
    try {
      return JSON.parse(load('rooms')) || []
    } catch {
      return []
    }
  })

  const commit = useCallback((change) => {
    setRooms((current) => {
      const next = change(current).sort((a, b) => activity(b) - activity(a))
      save('rooms', JSON.stringify(next))
      return next
    })
  }, [])

  const update = useCallback(
    (key, { people = [], last }) =>
      commit((current) => {
        const room = current.find((r) => r.key === key) || { key, people: [], addedAt: Date.now() }
        const merged = [...new Set([...room.people, ...people])]
        const same = merged.length === room.people.length && last?.at === room.last?.at
        if (same && current.includes(room)) return current
        return [
          ...current.filter((r) => r !== room),
          { ...room, people: merged, last: last || room.last }
        ]
      }),
    [commit]
  )

  const remove = useCallback(
    (key) => commit((current) => current.filter((r) => r.key !== key)),
    [commit]
  )

  return { rooms, update, remove }
}

function activity(room) {
  return room.last?.at || room.addedAt
}

// Rooms have no names; like Messages, call them after the people in them.
export function roomLabel(room) {
  if (!room) return 'Pear Chat'
  if (room.people.length === 0) return 'Room ' + room.key.slice(0, 4).toUpperCase()
  const shown = room.people.slice(0, 3).join(', ')
  return room.people.length > 3 ? `${shown} +${room.people.length - 3}` : shown
}
