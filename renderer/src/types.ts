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

export interface Member {
  key: string // their writer key in this room: what their avatar is drawn from
  name: string
}

export interface SavedRoom {
  key: string
  people: string[]
  members?: Member[] // missing in rooms saved by earlier versions
  addedAt: number
  last?: { text: string; name: string; at: number }
}

// The Network panel's view of the swarm, sent once a second while it is open.
export interface NetworkPeer {
  id: string
  name: string
  host: string | null
  port: number | null
  rtt: number | null // ms
  sent: number // bytes
  received: number
  retransmits: number
  dialed: boolean // true if we connected to them
  since: number
}

export interface NetworkLog {
  id: string
  mine: boolean
  name: string | null
  length: number // how long the log is known to be
  held: number // how much of it is on this Mac
  target: number
  bytes: number
  uploaded: number
  downloaded: number
  synced: number | null // my log only: how much a peer holds
}

export interface NetworkSnapshot {
  at: number
  dht: {
    host: string | null
    port: number
    firewalled: boolean
    randomized: boolean
    connections: number
  }
  room: { topic: string; announced: boolean; peers: NetworkPeer[]; logs: NetworkLog[] } | null
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
  | ({ type: 'network' } & Omit<NetworkSnapshot, 'at'>)

// Events that start in the UI.
export type LocalEvent =
  | { type: 'joining'; key: string | null }
  | { type: 'join-start' }
  | { type: 'sent'; messages: Message[] }
  | { type: 'worker-exit' }

export type ChatEvent = WorkerEvent | LocalEvent
