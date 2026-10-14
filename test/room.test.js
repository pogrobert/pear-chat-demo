const test = require('brittle')
const createTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const crypto = require('hypercore-crypto')

const Room = require('../workers/room.js')

// These tests run real Hyperswarm + Corestore peers against a local DHT
// (hyperdht/testnet), so nothing touches the public network.

test('two peers find each other, chat, and see presence', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const key = crypto.randomBytes(32)

  const alice = await createPeer(t, bootstrap, key, 'Alice')
  t.is(alice.room.status, 'discovering', 'starts out looking for peers')

  await until(() => alice.room.status === 'alone')
  t.pass('reports an empty room once discovery has finished')

  await alice.room.send('m1', 'hello?')
  t.is(alice.room.syncedLength, 0, 'message is pending while nobody else has it')

  const bob = await createPeer(t, bootstrap, key, 'Bob')
  await until(() => bob.messages.length === 1)
  t.alike(pick(bob.messages[0]), { id: 'm1', text: 'hello?', name: 'Alice', mine: false })

  await until(() => alice.room.syncedLength === 1)
  t.pass('message is synced once a peer holds it')

  const raw = await alice.store.get({ key: alice.room.local.key }).get(0)
  t.absent(raw.toString().includes('hello?'), 'blocks are encrypted with the room key')

  t.is(alice.room.status, 'connected')
  t.alike(names(alice.room), ['Bob'])
  t.alike(names(bob.room), ['Alice'])
  t.alike(alice.events, [{ joined: 'Bob' }], 'the peer already in the room is told who joined')
  t.alike(bob.events, [{}], 'the newcomer just sees who is there')

  await bob.room.send('m2', 'hi Alice')
  await until(() => alice.messages.length === 2)
  t.alike(pick(alice.messages[1]), { id: 'm2', text: 'hi Alice', name: 'Bob', mine: false })

  await bob.close()
  await until(() => alice.room.status === 'alone')
  t.alike(alice.events.at(-1), { left: 'Bob' }, 'peer leaving is reported')
})

test('a peer that was offline catches up on reconnect', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const key = crypto.randomBytes(32)
  const bobStorage = await t.tmp()

  const aliceStorage = await t.tmp()

  let alice = await createPeer(t, bootstrap, key, 'Alice', aliceStorage)
  let bob = await createPeer(t, bootstrap, key, 'Bob', bobStorage)

  await alice.room.send('m1', 'one')
  await until(() => bob.messages.length === 1)
  await bob.close()
  await until(() => alice.room.status === 'alone')

  await alice.room.send('m2', 'two')
  await alice.room.send('m3', 'three')
  t.is(alice.room.syncedLength, 1, 'messages sent while alone stay pending')

  bob = await createPeer(t, bootstrap, key, 'Bob', bobStorage)
  await until(() => bob.messages.length === 3)
  t.alike(
    bob.messages.map((m) => m.text),
    ['one', 'two', 'three'],
    'history from disk, then the missed messages'
  )
  t.alike(bob.catchups[0], { remaining: 2, total: 2 }, 'knows how far behind it is')
  t.alike(bob.catchups.at(-1), { remaining: 0, total: 2 }, 'and when it is done')

  await until(() => alice.room.syncedLength === 3)
  t.pass('pending messages become synced after the peer returns')

  await alice.close()
  await bob.close()
  alice = await createPeer(t, bootstrap, key, 'Alice', aliceStorage)
  t.is(alice.room.syncedLength, 3, 'synced state is remembered across a restart')
})

test('messages reach a peer that never met their author', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const key = crypto.randomBytes(32)

  const alice = await createPeer(t, bootstrap, key, 'Alice')
  const bob = await createPeer(t, bootstrap, key, 'Bob')
  await alice.room.send('m1', 'from alice')
  await until(() => bob.messages.length === 1)
  await alice.close()

  const carol = await createPeer(t, bootstrap, key, 'Carol')
  await until(() => carol.messages.length === 1)
  t.is(carol.messages[0].name, 'Alice', 'Bob passed on the log of a peer who has left')
})

test('typing is shared live and cleared when the typer leaves', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const key = crypto.randomBytes(32)

  const alice = await createPeer(t, bootstrap, key, 'Alice')
  const bob = await createPeer(t, bootstrap, key, 'Bob')
  await until(() => names(alice.room).length === 1 && names(bob.room).length === 1)

  bob.room.setTyping(true)
  await until(() => alice.typing.at(-1)?.join() === 'Bob')
  t.pass('Alice sees Bob typing')

  bob.room.setTyping(false)
  await until(() => alice.typing.at(-1)?.length === 0)
  t.pass('and sees him stop')

  bob.room.setTyping(true)
  await until(() => alice.typing.at(-1)?.join() === 'Bob')
  await bob.close()
  await until(() => alice.typing.at(-1)?.length === 0)
  t.pass('a peer that leaves mid-sentence stops typing')
})

test('read receipts reach the author and survive a restart', async (t) => {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const key = crypto.randomBytes(32)
  const aliceStorage = await t.tmp()

  let alice = await createPeer(t, bootstrap, key, 'Alice', aliceStorage)
  const bob = await createPeer(t, bootstrap, key, 'Bob')
  await alice.room.send('m1', 'one')
  await alice.room.send('m2', 'two')
  await until(() => bob.messages.length === 2)

  t.alike(alice.room.listReceipts(), [], 'nothing is seen until the reader looks')
  bob.room.markSeen()
  await until(() => alice.room.listReceipts()[0]?.length === 2)
  t.is(alice.room.listReceipts()[0].name, 'Bob', 'Alice knows Bob has read both')

  await alice.close()
  alice = await createPeer(t, bootstrap, key, 'Alice', aliceStorage)
  await until(() => alice.room.listReceipts()[0]?.length === 2)
  t.pass('after a restart, Bob tells Alice again how far he has read')
})

async function createPeer(t, bootstrap, key, name, storage) {
  const store = new Corestore(storage || (await t.tmp()))
  const swarm = new Hyperswarm({ bootstrap })
  swarm.on('connection', (conn) => store.replicate(conn))

  const room = new Room(store, swarm, key, { name })
  const peer = { room, store, messages: [], events: [], catchups: [], typing: [], close }
  room.on('message', (message) => peer.messages.push(message))
  room.on('peers', (peers, event) => peer.events.push(event))
  room.on('catchup', (catchup) => peer.catchups.push(catchup))
  room.on('typing', (names) => peer.typing.push(names))
  await room.ready()

  let closed = false
  async function close() {
    if (closed) return
    closed = true
    await room.close()
    await swarm.destroy()
    await store.close()
  }
  t.teardown(close, { order: -1 })

  return peer
}

function names(room) {
  return room.listPeers().map((peer) => peer.name)
}

function pick({ id, text, name, mine }) {
  return { id, text, name, mine }
}

async function until(fn, timeout = 15000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting for: ' + fn)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
