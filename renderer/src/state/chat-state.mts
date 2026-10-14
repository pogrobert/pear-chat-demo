// How the chat state changes in response to events: pure functions with no
// React, Zustand or Electron in them, so they are unit tested directly
// (test/chat-state.test.js) and the store only has to apply them.
import type {
  Catchup,
  ChatEvent,
  Item,
  Message,
  NetworkSnapshot,
  Peer,
  Phase,
  Receipt,
  Status
} from '../types.ts'

export interface ChatState {
  phase: Phase
  joinError: 'invalid-key' | 'storage' | null
  key: string | null
  me: string | null // my writer key in this room
  created: boolean
  openedAt: number // changes each time a room opens
  status: Status
  peers: Peer[]
  items: Item[] // messages and join/leave notices, sorted by time
  syncedLength: number
  catchup: Catchup | null
  typing: string[] // names of peers typing right now
  receipts: Receipt[] // how far each peer has read my log
  network: NetworkSnapshot | null // only while the Network panel is open
}

export const initialChatState: ChatState = {
  phase: 'lobby',
  joinError: null,
  key: null,
  me: null,
  created: false,
  openedAt: 0,
  status: 'starting',
  peers: [],
  items: [],
  syncedLength: 0,
  catchup: null,
  typing: [],
  receipts: [],
  network: null
}

export function reduce(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'joining':
      return { ...initialChatState, phase: 'joining', key: event.key }
    case 'join-start':
      return { ...state, joinError: null }
    case 'room':
      return {
        ...initialChatState,
        phase: 'room',
        openedAt: Date.now(),
        key: event.key,
        me: event.me,
        created: event.created,
        status: event.status,
        peers: event.peers,
        syncedLength: event.syncedLength,
        receipts: event.receipts
      }
    case 'join-failed':
      // An invalid key leaves the current room open; only show the error.
      if (event.reason === 'invalid-key' && state.phase === 'room') {
        return { ...state, joinError: event.reason }
      }
      return { ...initialChatState, joinError: event.reason }
    case 'left':
      return initialChatState
    case 'status':
      return { ...state, status: event.status }
    case 'peers': {
      const name = event.joined || event.left
      if (!name) return { ...state, peers: event.peers }
      const at = event.at ?? Date.now()
      const notice: Item = {
        kind: 'notice',
        id: 'notice:' + at + ':' + name,
        at,
        text: event.joined ? `${name} joined` : `${name} left`
      }
      return { ...state, peers: event.peers, items: merge(state.items, [notice]) }
    }
    case 'messages':
    case 'sent':
      return { ...state, items: merge(state.items, event.messages) }
    case 'send-failed':
      return {
        ...state,
        items: state.items.map((item) => (item.id === event.id ? { ...item, failed: true } : item))
      }
    case 'synced':
      return { ...state, syncedLength: event.syncedLength }
    case 'catchup':
      return { ...state, catchup: { remaining: event.remaining, total: event.total } }
    case 'typing':
      return { ...state, typing: event.names }
    case 'receipts':
      return { ...state, receipts: event.receipts }
    case 'network':
      return { ...state, network: { at: Date.now(), dht: event.dht, room: event.room } }
    case 'worker-exit':
    case 'error':
      return { ...state, phase: 'crashed' }
  }
}

// Messages from every peer's log are merged into one timeline ordered by the
// time the author wrote them. Ties fall back to (writer, seq) so that every
// peer ends up with exactly the same order. An item that arrives again (my
// optimistic message, echoed back from my log) replaces the earlier copy.
export function merge(items: Item[], incoming: Item[]): Item[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort(
    (a, b) => a.at - b.at || writerOf(a).localeCompare(writerOf(b)) || seqOf(a) - seqOf(b)
  )
}

function writerOf(item: Item): string {
  return item.kind === 'notice' ? '' : (item.writer ?? '')
}

function seqOf(item: Item): number {
  return item.kind === 'notice' ? 0 : (item.seq ?? 0)
}

export type Delivery = 'pending' | 'synced' | 'failed'

// A message of mine is synced once its position in my log is below the length
// that at least one other peer has confirmed holding.
export function deliveryOf(message: Message, syncedLength: number): Delivery | null {
  if (!message.mine) return null
  if (message.failed) return 'failed'
  return message.seq !== undefined && message.seq < syncedLength ? 'synced' : 'pending'
}

// Everyone who has read at least up to this message.
export function readersOf(receipts: Receipt[], message: Message): string[] {
  const seq = message.seq
  if (seq === undefined) return []
  return receipts.filter((receipt) => receipt.length > seq).map((receipt) => receipt.name)
}
