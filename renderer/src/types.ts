// The shapes that cross the worker boundary, and what the UI keeps.

export type Phase = 'lobby' | 'joining' | 'room' | 'crashed'
export type Status = 'starting' | 'discovering' | 'alone' | 'connected'

export interface Peer {
  id: string // the peer's writer key (hex)
  name: string
}

export interface Message {
  kind?: undefined
  id: string
  text: string
  name: string
  at: number // the author's clock, used for ordering
  mine: boolean
  writer?: string // whose log it is in; missing until my own echo arrives
  seq?: number // position in that log
  failed?: boolean
}

export interface Notice {
  kind: 'notice'
  id: string
  at: number
  text: string
}

export type Item = Message | Notice

export interface Receipt {
  id: string
  name: string
  length: number // how much of MY log this peer has read
}

export interface Catchup {
  remaining: number
  total: number
}

export interface SavedRoom {
  key: string
  people: string[]
  addedAt: number
  last?: { text: string; name: string; at: number }
}

// Events the Bare worker sends (see workers/main.js).
export type WorkerEvent =
  | {
      type: 'room'
      key: string
      me: string
      created: boolean
      status: Status
      peers: Peer[]
      syncedLength: number
      receipts: Receipt[]
    }
  | { type: 'join-failed'; reason: 'invalid-key' | 'storage'; detail?: string }
  | { type: 'left' }
  | { type: 'status'; status: Status }
  | { type: 'peers'; peers: Peer[]; joined?: string; left?: string; at?: number }
  | { type: 'messages'; messages: Message[] }
  | { type: 'synced'; syncedLength: number }
  | ({ type: 'catchup' } & Catchup)
  | { type: 'typing'; names: string[] }
  | { type: 'receipts'; receipts: Receipt[] }
  | { type: 'send-failed'; id: string; detail?: string }
  | { type: 'error'; detail?: string }

// Events that start in the UI.
export type LocalEvent =
  | { type: 'joining'; key: string | null }
  | { type: 'join-start' }
  | { type: 'sent'; messages: Message[] }
  | { type: 'worker-exit' }

export type ChatEvent = WorkerEvent | LocalEvent
