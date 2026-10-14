import { create } from 'zustand'
import type { ChatEvent, Message } from '../types.ts'
import { initialChatState, reduce, type ChatState } from './chat-state.mts'
import { useSaved } from './saved.ts'

// The live chat session: everything the Bare worker reports, plus the actions
// the UI can take. The renderer never touches the network; it exchanges small
// JSON messages with the worker through window.bridge (electron/preload.js).
const WORKER = '/workers/main.js'
const decoder = new TextDecoder()

interface ChatActions {
  dispatch(event: ChatEvent): void
  start(): Promise<void>
  // switching: the key is known to be valid (a new room, or one from the
  // sidebar), so clear the screen right away. A pasted key is only shown once
  // the worker accepts it, so a typo never closes the room you are in.
  join(key: string | null, options?: { switching?: boolean }): void
  send(text: string): void
  leave(): void
  rename(name: string): void
  setTyping(on: boolean): void
  seen(): void
  restart(): void
}

export type ChatStore = ChatState & ChatActions

function write(message: object) {
  return window.bridge.writeWorkerIPC(WORKER, JSON.stringify(message))
}

let listening = false
let typingSent = { on: false, at: 0 }

export const useChat = create<ChatStore>()((set, get) => ({
  ...initialChatState,
  // If there is a room to reopen, start in 'joining' so the lobby never flashes.
  phase: useSaved.getState().name && useSaved.getState().lastRoom ? 'joining' : 'lobby',

  dispatch(event) {
    set((state): Partial<ChatStore> => reduce(state, event))
    remember(get(), event)
  },

  async start() {
    listen(get().dispatch)
    await window.bridge.startWorker(WORKER)
    const last = useSaved.getState().lastRoom
    if (last) get().join(last)
  },

  join(key, { switching = true } = {}) {
    get().dispatch(switching ? { type: 'joining', key } : { type: 'join-start' })
    write({ type: 'join', key, name: useSaved.getState().name })
  },

  send(text) {
    // Optimistic: show the message immediately. The worker echoes it back with
    // the same id once it is in my log, and 'synced' follows when a peer has it.
    const message: Message = {
      id: crypto.randomUUID(),
      text,
      name: useSaved.getState().name,
      at: Date.now(),
      mine: true
    }
    get().dispatch({ type: 'sent', messages: [message] })
    write({ type: 'send', id: message.id, text })
  },

  leave: () => write({ type: 'leave' }),
  rename: (name) => write({ type: 'name', name }),

  // Sent when typing starts, then at most once a second while it lasts (the
  // worker throttles further), and once when it stops.
  setTyping(on) {
    if (on === typingSent.on && (!on || Date.now() - typingSent.at < 1000)) return
    typingSent = { on, at: Date.now() }
    write({ type: 'typing', typing: on })
  },

  // "I have looked at everything up to here." Only while the window is in
  // front, and only if read receipts are on.
  seen() {
    if (!document.hasFocus() || !useSaved.getState().receipts) return
    write({ type: 'seen' })
  },

  restart: () => window.location.reload()
}))

// Worker events arrive as JSON. Updater messages are plain strings; this demo
// has no update UI, so they are skipped.
function listen(dispatch: (event: ChatEvent) => void) {
  if (listening) return
  listening = true
  window.bridge.onWorkerIPC(WORKER, (data) => {
    let event: ChatEvent
    try {
      event = JSON.parse(decoder.decode(data))
    } catch {
      return
    }
    if (event.type === 'peers') event.at = Date.now()
    dispatch(event)
  })
  window.bridge.onWorkerExit(WORKER, () => dispatch({ type: 'worker-exit' }))
}

// Keep the saved side in step: which room to reopen, and who was in each room
// and what was said last, for the sidebar.
function remember(state: ChatState, event: ChatEvent) {
  const saved = useSaved.getState()
  if (event.type === 'room') saved.setLastRoom(event.key)
  if (event.type === 'left') saved.setLastRoom(null)
  if (state.phase !== 'room' || !state.key) return
  if (!['room', 'messages', 'sent', 'peers'].includes(event.type)) return

  const messages = state.items.filter((item): item is Message => item.kind !== 'notice')
  const last = messages.at(-1)
  saved.noteRoom(state.key, {
    people: [
      ...state.peers.map((peer) => peer.name),
      ...messages.filter((m) => !m.mine).map((m) => m.name)
    ],
    last: last && { text: last.text, name: last.mine ? 'You' : last.name, at: last.at }
  })
}
