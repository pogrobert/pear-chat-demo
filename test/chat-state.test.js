const test = require('brittle')

// The renderer's state logic is plain TypeScript with no React or Electron in
// it, so Node runs it directly (it strips the types) and it is tested here.
const load = () => import('../renderer/src/state/chat-state.mts')

const room = {
  type: 'room',
  key: 'k',
  me: 'mine',
  created: true,
  status: 'alone',
  peers: [],
  syncedLength: 0,
  receipts: []
}
const message = (id, at, extra = {}) => ({
  id,
  text: id,
  name: 'Alice',
  at,
  mine: false,
  writer: 'alice',
  ...extra
})

test('messages from every log are merged in time order, the same on every peer', async (t) => {
  const { reduce, initialChatState } = await load()
  let state = reduce(initialChatState, room)
  state = reduce(state, { type: 'messages', messages: [message('b', 2), message('a', 1)] })
  state = reduce(state, { type: 'messages', messages: [message('c', 2, { writer: 'bob' })] })
  t.alike(
    state.items.map((m) => m.id),
    ['a', 'b', 'c'],
    'ties on time fall back to the writer key'
  )
})

test('my optimistic message is replaced by the copy from my log', async (t) => {
  const { reduce, initialChatState, deliveryOf } = await load()
  let state = reduce(initialChatState, room)
  state = reduce(state, {
    type: 'sent',
    messages: [{ id: 'x', text: 'hi', name: 'Me', at: 5, mine: true }]
  })
  t.is(deliveryOf(state.items[0], state.syncedLength), 'pending', 'pending before it is in my log')

  state = reduce(state, {
    type: 'messages',
    messages: [{ id: 'x', text: 'hi', name: 'Me', at: 6, mine: true, writer: 'mine', seq: 0 }]
  })
  t.is(state.items.length, 1, 'one message, not two')
  t.is(deliveryOf(state.items[0], state.syncedLength), 'pending', 'still pending: no peer has it')

  state = reduce(state, { type: 'synced', syncedLength: 1 })
  t.is(deliveryOf(state.items[0], state.syncedLength), 'synced', 'synced once a peer holds it')
})

test('a bad key keeps the open room; other failures close it', async (t) => {
  const { reduce, initialChatState } = await load()
  const open = reduce(initialChatState, room)
  const typo = reduce(open, { type: 'join-failed', reason: 'invalid-key' })
  t.is(typo.phase, 'room')
  t.is(typo.joinError, 'invalid-key')

  const broken = reduce(open, { type: 'join-failed', reason: 'storage' })
  t.is(broken.phase, 'lobby')
})

test('joins and leaves become notices; read receipts say who has seen what', async (t) => {
  const { reduce, initialChatState, readersOf } = await load()
  let state = reduce(initialChatState, room)
  state = reduce(state, { type: 'peers', peers: [{ id: 'b', name: 'Bob' }], joined: 'Bob', at: 10 })
  t.is(state.items[0].text, 'Bob joined')

  const mine = { id: 'm', text: 'hey', name: 'Me', at: 11, mine: true, writer: 'mine', seq: 3 }
  const receipts = [
    { id: 'b', name: 'Bob', length: 4 },
    { id: 'c', name: 'Carol', length: 3 }
  ]
  t.alike(readersOf(receipts, mine), ['Bob'], 'Carol has read up to, not including, it')
})
