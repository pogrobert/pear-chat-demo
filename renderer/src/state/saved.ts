import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Member, SavedRoom } from '../types.ts'

// Sidebar width limits; read by the store while it is created, so declared first.
export const SIDEBAR = { min: 220, max: 420, default: 290, collapseBelow: 150 }

export function clampSidebar(width: number): number {
  return Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, width)))
}

// What this Mac remembers between launches: your name, your rooms, which room
// was open, and whether to send read receipts. Peers never see any of it.
interface SavedState {
  name: string
  receipts: boolean
  lastRoom: string | null
  rooms: SavedRoom[]
  sidebarWidth: number
  setName(name: string): void
  setSidebarWidth(width: number): void
  setReceipts(on: boolean): void
  setLastRoom(key: string | null): void
  noteRoom(
    key: string,
    update: { people: string[]; members: Member[]; last?: SavedRoom['last'] }
  ): void
  removeRoom(key: string): void
}

export const useSaved = create<SavedState>()(
  persist(
    (set) => ({
      ...fromEarlierVersions(),
      sidebarWidth: SIDEBAR.default,
      setName: (name) => set({ name }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebar(width) }),
      setReceipts: (receipts) => set({ receipts }),
      setLastRoom: (lastRoom) => set({ lastRoom }),

      // Who has been in a room and what was said last, for the sidebar.
      noteRoom: (key, { people, members, last }) =>
        set((state) => {
          const room = state.rooms.find((r) => r.key === key) ?? {
            key,
            people: [],
            addedAt: Date.now()
          }
          const merged = [...new Set([...room.people, ...people])]
          // Members by key; a later name for the same key replaces the earlier one.
          const byKey = new Map((room.members ?? []).map((m) => [m.key, m]))
          for (const member of members) byKey.set(member.key, member)
          const nextMembers = [...byKey.values()]
          const unchanged =
            state.rooms.includes(room) &&
            merged.length === room.people.length &&
            JSON.stringify(nextMembers) === JSON.stringify(room.members ?? []) &&
            last?.at === room.last?.at
          if (unchanged) return state
          const next = { ...room, people: merged, members: nextMembers, last: last ?? room.last }
          return { rooms: sortByActivity([...state.rooms.filter((r) => r !== room), next]) }
        }),

      removeRoom: (key) => set((state) => ({ rooms: state.rooms.filter((r) => r.key !== key) }))
    }),
    {
      name: 'pear-chat',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ name, receipts, lastRoom, rooms, sidebarWidth }) => ({
        name,
        receipts,
        lastRoom,
        rooms,
        sidebarWidth
      })
    }
  )
)

function sortByActivity(rooms: SavedRoom[]): SavedRoom[] {
  const activity = (room: SavedRoom) => room.last?.at ?? room.addedAt
  return rooms.sort((a, b) => activity(b) - activity(a))
}

// Before this store existed, settings lived in separate localStorage keys.
// Carry them over once so existing installs keep their name and rooms.
function fromEarlierVersions(): Pick<SavedState, 'name' | 'receipts' | 'lastRoom' | 'rooms'> {
  const read = (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  let rooms: SavedRoom[] = []
  try {
    rooms = JSON.parse(read('rooms') ?? '[]')
  } catch {}
  return {
    name: read('name') ?? '',
    receipts: read('receipts') !== 'off',
    lastRoom: read('room'),
    rooms
  }
}

// Rooms have no names; like Messages, call them after the people in them.
export function roomLabel(room: SavedRoom | undefined): string {
  if (!room) return 'Pear Chat'
  if (room.people.length === 0) return 'Room ' + room.key.slice(0, 4).toUpperCase()
  const shown = room.people.slice(0, 3).join(', ')
  return room.people.length > 3 ? `${shown} +${room.people.length - 3}` : shown
}
