import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChat } from './state/chat.ts'
import { roomLabel, useSaved } from './state/saved.ts'
import { useMedia, useNativeChrome, useOnline } from './hooks.ts'
import Sidebar from './Sidebar.tsx'
import Conversation, { Empty } from './Conversation.tsx'
import { NameSheet, JoinSheet } from './Sheets.tsx'
import Icon from './icons.tsx'
import Onboarding from './Onboarding.tsx'
import RoomDetails from './RoomDetails.tsx'
import type { Peer, SavedRoom, Status } from './types.ts'

const bridge = window.bridge

type Sheet = 'rename' | 'join' | null
type Pending = 'create' | 'join' | null

export default function App() {
  const { name, receipts, rooms, sidebarWidth } = useSaved(
    useShallow((s) => ({
      name: s.name,
      receipts: s.receipts,
      rooms: s.rooms,
      sidebarWidth: s.sidebarWidth
    }))
  )
  // Only what the window frame needs; the conversation subscribes to the rest
  // itself, so a new message doesn't re-render the whole window.
  const chat = useChat(
    useShallow((s) => ({
      phase: s.phase,
      key: s.key,
      me: s.me,
      status: s.status,
      peers: s.peers,
      joinError: s.joinError,
      openedAt: s.openedAt
    }))
  )
  const actions = useChat(
    useShallow((s) => ({
      start: s.start,
      join: s.join,
      leave: s.leave,
      rename: s.rename,
      seen: s.seen,
      restart: s.restart
    }))
  )

  const [sheet, setSheet] = useState<Sheet>(null)
  const [onboarding, setOnboarding] = useState(!name)
  const [pending, setPending] = useState<Pending>(null) // what to do once onboarding hands over
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const narrow = useMedia('(max-width: 620px)')
  const online = useOnline()
  const inRoom = chat.phase === 'room'
  const current = rooms.find((room) => room.key === chat.key)
  const showSidebar = sidebarOpen && !narrow

  useNativeChrome()

  // Start the worker (and reopen the last room) once we know who the user is.
  useEffect(() => {
    if (name) actions.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(name)])

  useEffect(() => {
    document.title = inRoom ? roomLabel(current) : 'Pear Chat'
  }, [inRoom, current])

  // A room opening (from the Join sheet or anywhere else) closes the sheet.
  useEffect(() => {
    if (chat.openedAt) setSheet((open) => (open === 'join' ? null : open))
  }, [chat.openedAt])

  const copyKey = useCallback(
    async (key = chat.key) => {
      if (!key) return
      await bridge.copy(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    },
    [chat.key]
  )

  const removeRoom = useCallback(
    async (room: SavedRoom) => {
      const ok = await bridge.confirm({
        message: `Remove “${roomLabel(room)}”?`,
        detail: 'The room is removed from this Mac. You can only rejoin it with its key.',
        confirm: 'Remove'
      })
      if (!ok) return
      useSaved.getState().removeRoom(room.key)
      if (room.key === chat.key) actions.leave()
    },
    [chat.key, actions]
  )

  const addRoom = useCallback(async () => {
    const choice = await bridge.popup([
      { id: 'new', label: 'New Room' },
      { id: 'join', label: 'Join Room…' }
    ])
    if (choice === 'new') actions.join(null)
    if (choice === 'join') setSheet('join')
  }, [actions])

  function changeName(next: string) {
    useSaved.getState().setName(next)
    setSheet(null)
    if (inRoom) actions.rename(next)
  }

  // Onboarding ends with an action. It runs once the name is set and the
  // worker has started, so the room is created under the new name.
  function finishOnboarding(next: string, action: 'create' | 'join') {
    setOnboarding(false)
    if (next !== name) changeName(next)
    setPending(action)
  }

  useEffect(() => {
    if (!name || !pending) return
    if (pending === 'create') actions.join(null)
    if (pending === 'join') setSheet('join')
    setPending(null)
  }, [name, pending, actions])

  // The menu bar drives the same actions as the buttons.
  useEffect(() => {
    bridge.setMenuState({ inRoom, sidebar: showSidebar, receipts })
  }, [inRoom, showSidebar, receipts])

  useEffect(
    () =>
      bridge.onMenu((action) => {
        if (action === 'welcome') setOnboarding(true)
        if (action === 'toggle-receipts') {
          const on = !useSaved.getState().receipts
          useSaved.getState().setReceipts(on)
          if (on) actions.seen() // turning them on reports what you've read
        }
        if (!name) return
        if (action === 'new-room') actions.join(null)
        if (action === 'join-room') setSheet('join')
        if (action === 'rename') setSheet('rename')
        if (action === 'toggle-sidebar') setSidebarOpen((open) => !open)
        if (action === 'copy-key' && inRoom) copyKey()
        if (action === 'remove-room' && current) removeRoom(current)
      }),
    [name, actions, inRoom, current, copyKey, removeRoom]
  )

  return (
    <>
      <div
        className={'app' + (showSidebar ? '' : ' sidebar-hidden')}
        style={{ '--sidebar-width': sidebarWidth + 'px' } as CSSProperties}
        inert={onboarding}
      >
        {showSidebar && (
          <Sidebar
            online={online}
            onAdd={addRoom}
            onCopy={copyKey}
            onRemove={removeRoom}
            onRename={() => setSheet('rename')}
            onWelcome={() => setOnboarding(true)}
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
              {inRoom && <RoomStatus status={chat.status} peers={chat.peers} online={online} />}
            </div>
            {inRoom && chat.key && (
              <RoomDetails
                people={current?.people ?? []}
                peers={chat.peers}
                name={name}
                me={chat.me}
                roomKey={chat.key}
                copied={copied}
                onCopy={() => copyKey()}
                onRemove={() => current && removeRoom(current)}
              />
            )}
            <span className='sr-only' role='status'>
              {copied ? 'Room key copied' : ''}
            </span>
          </header>

          {chat.phase === 'crashed' ? (
            <Empty
              title='Connection Stopped'
              action={
                <button className='default' onClick={actions.restart}>
                  Restart
                </button>
              }
            >
              The background process that connects you to peers has stopped. Your messages are safe
              on this Mac.
            </Empty>
          ) : inRoom ? (
            <Conversation
              people={current?.people ?? []}
              online={online}
              onCopyKey={() => copyKey()}
            />
          ) : chat.phase === 'joining' ? (
            <div className='content-fill' aria-busy='true' />
          ) : (
            <Empty
              title='Start a Conversation'
              action={
                <div className='buttons'>
                  <button onClick={() => setSheet('join')}>Join Room…</button>
                  <button className='default' onClick={() => actions.join(null)}>
                    New Room
                  </button>
                </div>
              }
            >
              Create a room and share its key, or join a room with a key someone sent you. Peers
              find each other through a distributed hash table and connect directly.
            </Empty>
          )}
        </main>
        {sheet === 'rename' && (
          <NameSheet name={name} onSave={changeName} onCancel={() => setSheet(null)} />
        )}
        {sheet === 'join' && (
          <JoinSheet
            error={chat.joinError}
            onJoin={(key) => actions.join(key, { switching: false })}
            onCancel={() => setSheet(null)}
          />
        )}
      </div>
      {onboarding && <Onboarding initialName={name} onDone={finishOnboarding} />}
    </>
  )
}

// The one place that says how the open room is doing.
function RoomStatus({ status, peers, online }: { status: Status; peers: Peer[]; online: boolean }) {
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
