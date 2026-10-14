import { useCallback, useEffect, useState } from 'react'
import { useChat } from './useChat.js'
import { useRooms, roomLabel } from './useRooms.js'
import { useNativeChrome } from './useNativeChrome.js'
import { load, save } from './storage.js'
import Sidebar from './Sidebar.jsx'
import Conversation, { Empty } from './Conversation.jsx'
import { NameSheet, JoinSheet } from './Sheets.jsx'
import Icon from './icons.jsx'
import RoomDetails from './RoomDetails.jsx'

const bridge = window.bridge

export default function App() {
  const [name, setName] = useState(() => load('name') || '')
  const [sheet, setSheet] = useState(name ? null : 'welcome')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const narrow = useMedia('(max-width: 620px)')
  const online = useOnline()
  const chat = useChat(name)
  const { rooms, update, remove } = useRooms()
  const { state } = chat
  const inRoom = state.phase === 'room'
  const current = rooms.find((room) => room.key === state.key)
  const showSidebar = sidebarOpen && !narrow

  useNativeChrome()

  // Remember who was in each room and what was said last, for the sidebar.
  useEffect(() => {
    if (!inRoom) return
    const messages = state.items.filter((item) => item.kind !== 'notice')
    const last = messages.at(-1)
    update(state.key, {
      people: [
        ...state.peers.map((peer) => peer.name),
        ...messages.filter((m) => !m.mine).map((m) => m.name)
      ],
      last: last && { text: last.text, name: last.mine ? 'You' : last.name, at: last.at }
    })
  }, [inRoom, state.key, state.items, state.peers, update])

  useEffect(() => {
    document.title = inRoom ? roomLabel(current) : 'Pear Chat'
  }, [inRoom, current])

  // A room opening (from the Join sheet or anywhere else) closes the sheet.
  useEffect(() => {
    if (state.openedAt) setSheet((open) => (open === 'join' ? null : open))
  }, [state.openedAt])

  const copyKey = useCallback(
    async (key = state.key) => {
      await bridge.copy(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    },
    [state.key]
  )

  const removeRoom = useCallback(
    async (room) => {
      const ok = await bridge.confirm({
        message: `Remove “${roomLabel(room)}”?`,
        detail: 'The room is removed from this Mac. You can only rejoin it with its key.',
        confirm: 'Remove'
      })
      if (!ok) return
      remove(room.key)
      if (room.key === state.key) chat.leave()
    },
    [remove, state.key, chat]
  )

  const addRoom = useCallback(async () => {
    const choice = await bridge.popup([
      { id: 'new', label: 'New Room' },
      { id: 'join', label: 'Join Room…' }
    ])
    if (choice === 'new') chat.join(null)
    if (choice === 'join') setSheet('join')
  }, [chat])

  function changeName(next) {
    save('name', next)
    setName(next)
    setSheet(null)
    if (inRoom) chat.rename(next)
  }

  // The menu bar drives the same actions as the buttons.
  useEffect(() => {
    bridge.setMenuState({ inRoom, sidebar: showSidebar })
  }, [inRoom, showSidebar])

  useEffect(
    () =>
      bridge.onMenu((action) => {
        if (!name) return
        if (action === 'new-room') chat.join(null)
        if (action === 'join-room') setSheet('join')
        if (action === 'rename') setSheet('rename')
        if (action === 'toggle-sidebar') setSidebarOpen((open) => !open)
        if (action === 'copy-key' && inRoom) copyKey()
        if (action === 'remove-room' && current) removeRoom(current)
      }),
    [name, chat, inRoom, current, copyKey, removeRoom]
  )

  return (
    <div className={'app' + (showSidebar ? '' : ' sidebar-hidden')}>
      {showSidebar && (
        <Sidebar
          rooms={rooms}
          current={state.key}
          onSelect={(key) => key !== state.key && chat.join(key)}
          onCopy={copyKey}
          onRemove={removeRoom}
          onAdd={addRoom}
          onHide={() => setSidebarOpen(false)}
        />
      )}

      <main className='content'>
        <header className='toolbar drag'>
          {!showSidebar && !narrow && (
            <button
              className='tool'
              onClick={() => setSidebarOpen(true)}
              aria-label='Show sidebar'
              title='Show Sidebar'
            >
              <Icon name='sidebar' />
            </button>
          )}
          <div className='title'>
            <h1>{inRoom ? roomLabel(current) : 'Pear Chat'}</h1>
            {inRoom && <Status status={state.status} peers={state.peers} online={online} />}
          </div>
          {inRoom && (
            <RoomDetails
              people={current?.people || []}
              peers={state.peers}
              name={name}
              roomKey={state.key}
              copied={copied}
              onCopy={() => copyKey()}
              onRemove={() => current && removeRoom(current)}
            />
          )}
          <span className='sr-only' role='status'>
            {copied ? 'Room key copied' : ''}
          </span>
        </header>

        {state.phase === 'crashed' ? (
          <Empty
            title='Connection Stopped'
            action={
              <button className='default' onClick={chat.restart}>
                Restart
              </button>
            }
          >
            The background process that connects you to peers has stopped. Your messages are safe on
            this Mac.
          </Empty>
        ) : inRoom ? (
          <Conversation
            state={state}
            people={current?.people}
            online={online}
            onSend={chat.send}
            onCopyKey={() => copyKey()}
          />
        ) : state.phase === 'joining' ? (
          <div className='content-fill' aria-busy='true' />
        ) : (
          <Empty
            title='Start a Conversation'
            action={
              <div className='buttons'>
                <button onClick={() => setSheet('join')}>Join Room…</button>
                <button className='default' onClick={() => chat.join(null)}>
                  New Room
                </button>
              </div>
            }
          >
            Create a room and share its key, or join a room with a key someone sent you. Peers find
            each other through a distributed hash table and connect directly.
          </Empty>
        )}
      </main>

      {sheet === 'welcome' && <NameSheet firstRun onSave={changeName} />}
      {sheet === 'rename' && (
        <NameSheet name={name} onSave={changeName} onCancel={() => setSheet(null)} />
      )}
      {sheet === 'join' && (
        <JoinSheet
          error={state.joinError}
          onJoin={(key) => chat.join(key, { switching: false })}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function Status({ status, peers, online }) {
  const { tone, label } = !online
    ? { tone: 'off', label: 'Offline' }
    : status === 'connected'
      ? {
          tone: 'on',
          label: 'Connected to ' + (peers.length === 1 ? peers[0].name : `${peers.length} peers`)
        }
      : status === 'alone'
        ? { tone: 'idle', label: 'No one else is here' }
        : { tone: 'busy', label: 'Looking for peers…' }
  return (
    <p className={'subtitle ' + tone} role='status'>
      <span className='dot' aria-hidden='true' />
      {label}
    </p>
  )
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}
