// The Bare worker: all peer-to-peer code runs here, never in the renderer.
// Started by electron/main.js through PearRuntime.run(); Bare.IPC is the pipe
// back to it. The updater part is the hello-pear-worker boilerplate.
const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const crypto = require('hypercore-crypto')
const idEnc = require('hypercore-id-encoding')
const path = require('bare-path')

const Room = require('./room.js')

// argument order is a contract with getWorker() in electron/main.js
const argv = (index) => Bare.argv[index + 2]
const config = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4),
  app: argv(5)
}

const pipe = new FramedStream(Bare.IPC)

// One Corestore and one Hyperswarm for the whole app. Every connection the
// swarm makes replicates every core we have open that the other side also has.
const store = new Corestore(path.join(config.dir, 'pear-runtime', 'corestore'))
const swarm = new Hyperswarm()
swarm.on('connection', (conn) => store.replicate(conn))

// --- over-the-air updates (from the template) ---

const pear = new PearRuntime({ ...config, swarm, store })
pear.updater.on('error', (err) => pipe.write('updater-error ' + err.message))
pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))

if (config.updates) {
  swarm.join(pear.updater.drive.core.discoveryKey, { client: true, server: false })
}

async function applyUpdate() {
  try {
    await pear.ready()
    await pear.updater.applyUpdate()
    pipe.write('pear:updateApplied')
  } catch (err) {
    pipe.write('pear:updateFailed ' + err.message)
  }
}

// --- chat ---
// The renderer sends { type: 'join' | 'leave' | 'send' | 'name' } as JSON and
// gets back the events below. Updater messages stay plain strings.

let room = null
let watching = null // interval sending network snapshots while the panel is open
let queue = [] // messages are batched so loading history is not one IPC call each
let flushing = null
let busy = Promise.resolve() // joins and leaves run one at a time

function emit(type, data) {
  pipe.write(JSON.stringify({ type, ...data }))
}

function flush() {
  flushing = null
  if (queue.length === 0) return
  emit('messages', { messages: queue })
  queue = []
}

async function join(message) {
  let key
  try {
    key = message.key ? idEnc.decode(message.key.trim()) : crypto.randomBytes(32)
  } catch {
    return emit('join-failed', { reason: 'invalid-key' })
  }

  await closeRoom()

  const next = new Room(store, swarm, key, { name: message.name })
  next.on('message', (m) => {
    queue.push(m)
    if (room === next && !flushing) flushing = setTimeout(flush, 10)
  })
  next.on('status', (status) => emit('status', { status }))
  next.on('peers', (peers, event) => emit('peers', { peers, ...event }))
  next.on('synced', (syncedLength) => emit('synced', { syncedLength }))
  next.on('catchup', (catchup) => emit('catchup', catchup))
  next.on('typing', (names) => emit('typing', { names }))
  next.on('receipts', (receipts) => emit('receipts', { receipts }))

  try {
    await next.ready()
  } catch (err) {
    await next.close().catch(noop)
    return emit('join-failed', { reason: 'storage', detail: err.message })
  }

  room = next
  emit('room', {
    key: idEnc.encode(key),
    created: !message.key,
    status: room.status,
    peers: room.listPeers(),
    me: room.id, // my writer key in this room: what my avatar is made from
    syncedLength: room.syncedLength,
    receipts: room.listReceipts()
  })
  flush()
}

async function closeRoom() {
  if (!room) return
  const closing = room
  room = null
  queue = []
  await closing.close()
}

async function leave() {
  await closeRoom()
  emit('left')
}

pipe.on('data', (data) => {
  const text = data.toString()
  if (text === 'pear:applyUpdate') return applyUpdate()

  let message
  try {
    message = JSON.parse(text)
  } catch {
    return
  }

  if (message.type === 'network') watchNetwork(message.watch === true)
  else if (message.type === 'join') busy = busy.then(() => join(message)).catch(onerror)
  else if (message.type === 'leave') busy = busy.then(leave).catch(onerror)
  else if (!room) return
  else if (message.type === 'name') room.setName(message.name)
  else if (message.type === 'typing') room.setTyping(message.typing === true)
  else if (message.type === 'seen') room.markSeen()
  else if (message.type === 'send') {
    room.send(message.id, message.text).catch((err) => {
      emit('send-failed', { id: message.id, detail: err.message })
    })
  }
})

// While the Network panel is open, send it a snapshot every second: this
// Mac's place on the DHT, and the room's peers and logs.
function watchNetwork(on) {
  clearInterval(watching)
  watching = null
  if (!on) return
  const tick = () => {
    const dht = swarm.dht
    emit('network', {
      dht: {
        host: dht.host,
        port: dht.port,
        firewalled: dht.firewalled,
        randomized: dht.randomized,
        connections: swarm.connections.size
      },
      room: room ? room.networkStats() : null
    })
  }
  tick()
  watching = setInterval(tick, 1000)
}

function onerror(err) {
  console.error(err)
  emit('error', { detail: err.message })
}

function noop() {}

goodbye(async () => {
  clearInterval(watching)
  // Swarm first: destroying it un-announces us and only then drops connections.
  // Closing the room first would tell peers we left while we still replicate.
  await swarm.destroy()
  if (room) await room.close()
  await pear.close()
  await store.close()
})
