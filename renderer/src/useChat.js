import { useCallback, useEffect, useReducer } from 'react'
import { load, save } from './storage.js'

// The renderer never touches the network. It talks to the Bare worker through
// window.bridge (see electron/preload.js) using small JSON messages.
const WORKER = '/workers/main.js'
const bridge = window.bridge
const decoder = new TextDecoder()

const initial = {
  phase: 'lobby', // 'lobby' | 'joining' | 'room' | 'crashed'
  joinError: null,
  key: null,
  created: false,
  status: 'starting', // 'discovering' | 'alone' | 'connected'
  peers: [],
  items: [], // messages and join/leave notices, sorted by time
  syncedLength: 0,
  catchup: null // { remaining, total }
}

function reducer(state, event) {
  switch (event.type) {
    case 'joining':
      return { ...initial, phase: 'joining' }
    case 'room':
      return {
        ...initial,
        phase: 'room',
        key: event.key,
        created: event.created,
        status: event.status,
        peers: event.peers,
        syncedLength: event.syncedLength
      }
    case 'join-failed':
      return { ...initial, joinError: event.reason }
    case 'left':
      return initial
    case 'status':
      return { ...state, status: event.status }
    case 'peers': {
      const name = event.joined || event.left
      if (!name) return { ...state, peers: event.peers }
      const notice = {
        kind: 'notice',
        id: 'notice:' + event.at,
        at: event.at,
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
    case 'worker-exit':
    case 'error':
      return { ...state, phase: 'crashed' }
    default:
      return state
  }
}

// Messages from every peer's log are merged into one timeline ordered by the
// time the author wrote them. Ties fall back to (writer, seq) so that every
// peer ends up with exactly the same order.
function merge(items, incoming) {
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort(
    (a, b) =>
      a.at - b.at || String(a.writer).localeCompare(String(b.writer)) || (a.seq ?? 0) - (b.seq ?? 0)
  )
}

function write(message) {
  return bridge.writeWorkerIPC(WORKER, JSON.stringify(message))
}

export function useChat(name) {
  // If there is a room to reopen, start in 'joining' so the lobby never flashes.
  const [state, dispatch] = useReducer(reducer, initial, (base) => ({
    ...base,
    phase: name && load('room') ? 'joining' : 'lobby'
  }))

  const join = useCallback(
    (key) => {
      dispatch({ type: 'joining' })
      write({ type: 'join', key, name })
    },
    [name]
  )

  useEffect(() => {
    const offIpc = bridge.onWorkerIPC(WORKER, (data) => {
      let event
      try {
        event = JSON.parse(decoder.decode(data))
      } catch {
        return // updater messages are plain strings; this demo has no update UI
      }
      if (event.type === 'room') save('room', event.key)
      if (event.type === 'left' || event.type === 'join-failed') save('room', null)
      if (event.type === 'peers') event.at = Date.now()
      dispatch(event)
    })
    const offExit = bridge.onWorkerExit(WORKER, () => dispatch({ type: 'worker-exit' }))

    return () => {
      offIpc()
      offExit()
    }
  }, [])

  // Start the worker and reopen the last room once we know who the user is.
  useEffect(() => {
    if (!name) return
    let cancelled = false
    bridge.startWorker(WORKER).then(() => {
      const last = load('room')
      if (last && !cancelled) join(last)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(name)])

  const send = useCallback(
    (text) => {
      // Optimistic: show the message immediately. The worker echoes it back
      // with the same id once it is in my log, and 'synced' follows when a
      // peer has it.
      const message = { id: crypto.randomUUID(), text, name, at: Date.now(), mine: true }
      dispatch({ type: 'sent', messages: [message] })
      write({ type: 'send', id: message.id, text })
    },
    [name]
  )

  const leave = useCallback(() => write({ type: 'leave' }), [])
  const rename = useCallback((next) => write({ type: 'name', name: next }), [])
  const restart = useCallback(() => window.location.reload(), [])

  return { state, join, send, leave, rename, restart }
}

// A message of mine is synced once its position in my log is below the length
// that at least one other peer has confirmed holding.
export function statusOf(message, syncedLength) {
  if (!message.mine) return null
  if (message.failed) return 'failed'
  return message.seq !== undefined && message.seq < syncedLength ? 'synced' : 'pending'
}
