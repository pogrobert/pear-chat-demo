const ReadyResource = require('ready-resource')
const Protomux = require('protomux')
const c = require('compact-encoding')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const PROTOCOL = 'pear-chat-demo/room'
const MAX_NAME = 40
const MAX_TEXT = 4000
const MAX_WRITERS = 256
const TYPING_REFRESH = 3000 // resend "typing" this often while it lasts
const TYPING_EXPIRY = 6000 // and forget it if no refresh arrives

// One chat room.
//
// Data model: every peer appends its messages to its own Hypercore (an
// append-only log only that peer can sign). A room is the set of those logs.
// Peers tell each other which logs exist in a small "hello" message, Corestore
// replicates them, and the UI merges them by timestamp.
//
// Besides the logs, peers exchange two kinds of short-lived signals on the
// same channel as the hello: "typing" (never stored, expires on its own) and
// "seen" (how far each person has read every log, for read receipts).
//
// Events: 'status', 'peers', 'message', 'synced', 'catchup', 'typing', 'receipts'
module.exports = class Room extends ReadyResource {
  constructor(store, swarm, key, opts = {}) {
    super()

    this.key = key
    // Peers meet on a hash of the room key, so the DHT nodes that store the
    // announcement never see the key itself. The key also encrypts the logs.
    this.topic = crypto.hash(key)
    this.name = cleanName(opts.name)

    this.store = store.namespace(key)
    this.swarm = swarm
    this.local = null
    this.discovery = null

    this.writers = new Map() // hex core key -> { core, read, target, stream }
    this.peers = new Map() // connection -> { channel, hello, id, name, wasHere }
    this.status = 'starting' // -> 'discovering' -> 'alone' | 'connected'
    this.catchup = { remaining: 0, total: 0 }

    this.seen = {} // how far I have read each other writer's log
    this.receipts = new Map() // peer id -> { name, length } of MY log they have read
    this._typing = false
    this._typingSentAt = 0
    this._typingNames = ''

    this._discovered = false
    this._lastAt = 0
    this._onconnection = this._onconnection.bind(this)
  }

  get id() {
    return b4a.toString(this.local.key, 'hex')
  }

  // How many of my own messages at least one other peer has confirmed holding.
  // A peer announces the range of blocks it has; Hypercore keeps the highest
  // fully contiguous one in remoteContiguousLength and persists it to disk.
  get syncedLength() {
    return this.local.remoteContiguousLength
  }

  async _open() {
    this.local = this._getCore({ name: 'messages' })
    await this.local.ready()

    if (this.local.length > 0) {
      const last = await this.local.get(this.local.length - 1)
      this._lastAt = last.at
    }

    this.local.on('remote-contiguous-length', () => this.emit('synced', this.syncedLength))

    // The writers we met in earlier sessions are kept in the local core's user
    // data, which is stored on disk but never replicated.
    const saved = await this.local.getUserData('writers')
    this._addWriter(this.id)
    if (saved) for (const id of JSON.parse(b4a.toString(saved))) this._addWriter(id)

    this.swarm.on('connection', this._onconnection)
    for (const conn of this.swarm.connections) this._onconnection(conn)

    this.discovery = this.swarm.join(this.topic)
    this._setStatus()
    this._discover()
  }

  async _close() {
    this.swarm.removeListener('connection', this._onconnection)
    for (const peer of this.peers.values()) peer.channel.close()
    for (const writer of this.writers.values()) writer.stream.destroy()
    if (this.discovery) await this.discovery.destroy()
    await this.store.close()
  }

  async send(id, text) {
    // Never let my own clock move backwards within my own log.
    const at = (this._lastAt = Math.max(Date.now(), this._lastAt + 1))
    await this.local.append({ id, text: text.slice(0, MAX_TEXT), name: this.name, at })
  }

  setName(name) {
    this.name = cleanName(name)
    this._broadcastHello()
  }

  // Ephemeral: sent to whoever is connected right now and never written down.
  setTyping(typing) {
    const now = Date.now()
    if (typing === this._typing && (!typing || now - this._typingSentAt < TYPING_REFRESH)) return
    this._typing = typing
    this._typingSentAt = now
    for (const peer of this.peers.values()) {
      if (peer.channel.opened) peer.typingMessage.send({ typing })
    }
  }

  // The UI calls this when the person has actually looked at everything loaded
  // so far. Peers learn how far I have read each of their logs.
  markSeen() {
    const seen = {}
    for (const [id, writer] of this.writers) if (id !== this.id) seen[id] = writer.read
    if (JSON.stringify(seen) === JSON.stringify(this.seen)) return
    this.seen = seen
    for (const peer of this.peers.values()) {
      if (peer.channel.opened) peer.seenMessage.send({ seen })
    }
  }

  // A snapshot of the room's network state for the Network panel: every
  // connected peer and how we reach them, and every log and how much of it
  // has been replicated.
  networkStats() {
    const peers = []
    for (const [conn, peer] of this.peers) {
      if (!peer.id) continue
      const raw = conn.rawStream // the UDX stream underneath the encryption
      peers.push({
        id: peer.id,
        name: peer.name,
        host: raw?.remoteHost ?? null,
        port: raw?.remotePort ?? null,
        rtt: raw?.rtt ?? null,
        sent: raw?.bytesTransmitted ?? 0,
        received: raw?.bytesReceived ?? 0,
        retransmits: raw?.retransmits ?? 0,
        dialed: conn.isInitiator, // true if we connected to them
        since: peer.since
      })
    }

    const logs = []
    for (const [id, writer] of this.writers) {
      const mine = id === this.id
      logs.push({
        id,
        mine,
        name: mine ? this.name : (this._nameOf(id) ?? writer.name),
        length: writer.core.length, // how long we know the log to be
        held: writer.read, // how much of it is on this Mac
        target: Math.max(writer.target, writer.core.length),
        bytes: writer.core.byteLength,
        uploaded: writer.uploaded,
        downloaded: writer.downloaded,
        synced: mine ? this.syncedLength : null // for my log: how much a peer holds
      })
    }

    return { topic: b4a.toString(this.topic, 'hex'), announced: this._discovered, peers, logs }
  }

  _nameOf(id) {
    for (const peer of this.peers.values()) if (peer.id === id) return peer.name
    return null
  }

  listReceipts() {
    return [...this.receipts].map(([id, { name, length }]) => ({ id, name, length }))
  }

  listPeers() {
    const peers = []
    for (const peer of this.peers.values()) {
      if (peer.id) peers.push({ id: peer.id, name: peer.name })
    }
    return peers
  }

  _getCore(opts) {
    return this.store.get({ ...opts, valueEncoding: 'json', encryption: { key: this.key } })
  }

  // --- discovery ---

  async _discover() {
    try {
      await this.discovery.flushed() // our announcement has reached the DHT
      await this.swarm.flush() // every peer found so far has been tried
    } catch {
      return // closed while discovering
    }
    this._discovered = true
    this._setStatus()
  }

  _setStatus() {
    const online = this.listPeers().length > 0
    const status = online ? 'connected' : this._discovered ? 'alone' : 'discovering'
    if (status === this.status) return
    this.status = status
    this.emit('status', status)
  }

  // --- presence: one protomux channel per connection, next to replication ---

  _onconnection(conn) {
    const mux = Protomux.from(conn)
    // The channel only opens if the other side opens the same protocol + id,
    // which means: only with peers that are in this room.
    const channel = mux.createChannel({
      protocol: PROTOCOL,
      id: this.topic,
      onopen: () => this._sendHello(peer),
      onclose: () => this._onpeerclose(conn)
    })
    if (channel === null) return // already open on this connection

    // Peers we connect to during our own first discovery were here before us,
    // so they are listed without a "joined" notice.
    const peer = { channel, id: null, name: null, wasHere: !this._discovered, typing: false }
    peer.hello = channel.addMessage({
      encoding: c.json,
      onmessage: (message) => this._onhello(peer, message)
    })
    peer.typingMessage = channel.addMessage({
      encoding: c.json,
      onmessage: (message) => this._ontyping(peer, message)
    })
    peer.seenMessage = channel.addMessage({
      encoding: c.json,
      onmessage: (message) => this._onseen(peer, message)
    })
    this.peers.set(conn, peer)
    channel.open()
  }

  _onpeerclose(conn) {
    const peer = this.peers.get(conn)
    this.peers.delete(conn)
    if (!peer || !peer.id || this.closing) return
    clearTimeout(peer.typingTimer)
    peer.typing = false
    this._emitTyping()
    this.emit('peers', this.listPeers(), { left: peer.name })
    this._setStatus()
  }

  // hello = who I am + every log I know about and how much of it I hold
  _sendHello(peer) {
    const writers = []
    for (const [id, writer] of this.writers) writers.push({ id, length: writer.read })
    peer.hello.send({ id: this.id, name: this.name, writers })
    // Read positions survive reconnects: send them again to every new peer.
    if (Object.keys(this.seen).length) peer.seenMessage.send({ seen: this.seen })
    if (this._typing) peer.typingMessage.send({ typing: true })
  }

  _broadcastHello() {
    for (const peer of this.peers.values()) {
      if (peer.channel.opened) this._sendHello(peer)
    }
  }

  // Everything in a hello comes from another machine, so it is checked.
  _onhello(peer, message) {
    if (!message || !isKey(message.id) || !Array.isArray(message.writers)) return

    const joined = peer.id === null
    if (joined) peer.since = Date.now()
    const renamed = !joined && peer.name !== cleanName(message.name)
    peer.id = message.id
    peer.name = cleanName(message.name)

    let learned = false
    for (const { id, length } of message.writers.slice(0, MAX_WRITERS)) {
      if (!isKey(id)) continue
      if (this._addWriter(id)) learned = true
      // If their copy of a log is longer than what I have read, I am behind.
      const writer = this.writers.get(id)
      if (writer && Number.isInteger(length)) writer.target = Math.max(writer.target, length)
    }

    // Pass on logs this peer just taught us, so writers reach peers who were
    // never online at the same time as them.
    if (learned) this._broadcastHello()
    const receipt = this.receipts.get(peer.id)
    if (receipt && receipt.name !== peer.name) {
      receipt.name = peer.name
      this.emit('receipts', this.listReceipts())
    }

    if (joined || renamed) {
      this.emit('peers', this.listPeers(), joined && !peer.wasHere ? { joined: peer.name } : {})
    }
    this._setStatus()
    this._updateCatchup()
  }

  _ontyping(peer, message) {
    if (!peer.id || typeof message?.typing !== 'boolean') return
    clearTimeout(peer.typingTimer)
    peer.typing = message.typing
    // A peer that crashes mid-sentence never says it stopped, so it expires.
    if (peer.typing) {
      peer.typingTimer = setTimeout(() => {
        peer.typing = false
        this._emitTyping()
      }, TYPING_EXPIRY)
    }
    this._emitTyping()
  }

  _emitTyping() {
    const names = [...this.peers.values()].filter((p) => p.typing).map((p) => p.name)
    if (names.join('\n') === this._typingNames) return
    this._typingNames = names.join('\n')
    this.emit('typing', names)
  }

  // How far this peer has read MY log. Untrusted, so clamped to its real length.
  _onseen(peer, message) {
    const length = message?.seen?.[this.id]
    if (!peer.id || !Number.isInteger(length) || length < 0) return
    const read = Math.min(length, this.local.length)
    const previous = this.receipts.get(peer.id)
    if (previous && previous.length >= read) return
    this.receipts.set(peer.id, { name: peer.name, length: read })
    this.emit('receipts', this.listReceipts())
  }

  // --- reading the logs ---

  _addWriter(id) {
    if (this.writers.has(id) || this.writers.size >= MAX_WRITERS) return false

    const mine = this.local.key && id === this.id
    const core = mine ? this.local : this._getCore({ key: b4a.from(id, 'hex') })
    const writer = {
      core,
      read: 0,
      target: 0,
      stream: null,
      name: null,
      uploaded: 0,
      downloaded: 0
    }
    this.writers.set(id, writer)

    // Bytes this log has moved over the network, for the Network panel.
    core.on('upload', (index, bytes) => (writer.uploaded += bytes))
    core.on('download', (index, bytes) => (writer.downloaded += bytes))

    // Fetch every block in the background instead of one at a time as we read.
    if (!mine) core.download({ start: 0, end: -1 })

    // A live stream yields blocks in log order: first what is on disk, then
    // each new block as it is appended locally or arrives from a peer.
    writer.stream = core.createReadStream({ live: true })
    writer.stream.on('data', (block) => {
      const seq = writer.read++
      const message = toMessage(block, id, seq, mine)
      if (message) {
        writer.name = message.name
        this.emit('message', message)
      }
      this._updateCatchup()
    })
    writer.stream.on('error', noop) // destroyed on close, or a peer wrote garbage

    this.local.setUserData('writers', JSON.stringify([...this.writers.keys()])).catch(noop)
    return true
  }

  _updateCatchup() {
    let remaining = 0
    for (const writer of this.writers.values()) {
      remaining += Math.max(0, writer.target - writer.read)
    }
    if (remaining === this.catchup.remaining) return

    const grew = Math.max(0, remaining - this.catchup.remaining)
    const total = this.catchup.remaining === 0 ? remaining : this.catchup.total + grew
    this.catchup = { remaining, total }
    this.emit('catchup', this.catchup)
  }
}

function toMessage(block, writer, seq, mine) {
  if (!block || typeof block.text !== 'string' || typeof block.at !== 'number') return null
  return {
    id: typeof block.id === 'string' ? block.id : writer + ':' + seq,
    writer,
    seq,
    mine,
    text: block.text.slice(0, MAX_TEXT),
    name: cleanName(block.name),
    at: block.at
  }
}

function cleanName(name) {
  return (typeof name === 'string' && name.trim().slice(0, MAX_NAME)) || 'Anonymous'
}

function isKey(id) {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id)
}

function noop() {}
