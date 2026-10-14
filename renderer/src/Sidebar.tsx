import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import Icon from './icons.tsx'
import Avatar from './Avatar.tsx'
import Resizer from './Resizer.tsx'
import { useChat } from './state/chat.ts'
import { roomLabel, useSaved } from './state/saved.ts'
import type { SavedRoom } from './types.ts'

// A room key is 52 z-base-32 characters (or 64 hex); pear:// links work too.
const KEY = /^(pear:\/\/)?([a-z0-9]{52}|[0-9a-f]{64})$/i

interface Props {
  online: boolean
  onAdd(): void
  onCopy(key: string): void
  onRemove(room: SavedRoom): void
  onHide(): void
  onRename(): void
  onWelcome(): void
}

// Rooms you have been in, and at the bottom, you and your connection to the
// network. Live presence ("2 here") is only known for the open room, because
// the app is connected to one room at a time; the others show how many
// people have been in them.
export default function Sidebar({
  online,
  onAdd,
  onCopy,
  onRemove,
  onHide,
  onRename,
  onWelcome
}: Props) {
  const rooms = useSaved((s) => s.rooms)
  const name = useSaved((s) => s.name)
  const { current, me, peers, joinError, inRoom } = useChat(
    useShallow((s) => ({
      current: s.key,
      me: s.me,
      peers: s.peers,
      joinError: s.joinError,
      inRoom: s.phase === 'room'
    }))
  )
  const join = useChat((s) => s.join)

  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState(false)
  const q = query.trim()
  const isKey = KEY.test(q)
  const shown =
    q && !isKey
      ? rooms.filter((room) =>
          (roomLabel(room) + ' ' + (room.last?.text ?? '')).toLowerCase().includes(q.toLowerCase())
        )
      : rooms

  function joinKey() {
    setJoining(true)
    join(q, { switching: false })
  }

  // A successful join opens the room; clear the field then.
  useEffect(() => {
    if (!joining || joinError || !current) return
    setQuery('')
    setJoining(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Arrow keys move through the list, as in any Mac source list.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = shown.findIndex((room) => room.key === current)
    const next = shown[index + (event.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      select(next.key)
      document.getElementById('room-' + next.key)?.focus()
    }
  }

  function select(key: string) {
    if (key !== current) join(key)
  }

  async function onContextMenu(event: MouseEvent, room: SavedRoom) {
    event.preventDefault()
    const choice = await window.bridge.popup([
      { id: 'copy', label: 'Copy Room Key' },
      { separator: true },
      { id: 'remove', label: 'Remove Room…' }
    ])
    if (choice === 'copy') onCopy(room.key)
    if (choice === 'remove') onRemove(room)
  }

  async function openSettings() {
    const choice = await window.bridge.popup([
      { id: 'rename', label: 'Change Display Name…' },
      { id: 'welcome', label: 'Show Welcome' }
    ])
    if (choice === 'rename') onRename()
    if (choice === 'welcome') onWelcome()
  }

  const net = network(online)

  return (
    <nav className='sidebar' aria-label='Rooms'>
      <div className='sidebar-top drag'>
        <button className='tool' onClick={onHide} aria-label='Hide sidebar' title='Hide Sidebar'>
          <Icon name='sidebar' />
        </button>
      </div>

      <label className='find'>
        <Icon name='search' size={15} />
        <input
          type='search'
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setJoining(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
            if (event.key === 'Enter' && isKey) joinKey()
          }}
          placeholder='Find or join a room'
          aria-label='Find a room, or paste a room key to join it'
          spellCheck={false}
        />
      </label>
      {isKey && (
        <button className='join-key' onClick={joinKey}>
          <Icon name='key' size={16} />
          {joining && !joinError ? 'Joining…' : 'Join room with this key'}
        </button>
      )}
      {isKey && joining && joinError && (
        <p className='find-error' role='alert'>
          Couldn’t join with that key.
        </p>
      )}

      <div className='section-header'>
        <h2>Rooms</h2>
        <button
          className='tool small'
          onClick={onAdd}
          aria-label='New room'
          title='New Room or Join Room'
        >
          <Icon name='plus' size={15} />
        </button>
      </div>

      <div className='sidebar-scroll'>
        {rooms.length === 0 ? (
          <p className='sidebar-empty'>No rooms yet</p>
        ) : shown.length === 0 ? (
          <p className='sidebar-empty'>No results</p>
        ) : (
          <ul className='rooms' onKeyDown={onKeyDown}>
            {shown.map((room) => {
              const open = room.key === current
              const live = open && peers.length > 0
              return (
                <li key={room.key}>
                  <button
                    id={'room-' + room.key}
                    className='room-row'
                    aria-current={open ? 'true' : undefined}
                    onClick={() => select(room.key)}
                    onContextMenu={(event) => onContextMenu(event, room)}
                    title={room.last ? `${room.last.name}: ${room.last.text}` : 'No messages yet'}
                  >
                    <Avatar seed={room.key} size='medium' online={live} />
                    <span className='room-name'>{roomLabel(room)}</span>
                    {live && <span className='room-meta live'>{peers.length + 1} here</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Resizer onCollapse={onHide} />

      <div className='me-bar'>
        <Avatar seed={inRoom ? me : null} size='me' />
        <div className='who'>
          <b>{name}</b>
          <small role='status'>
            <span className={'dot ' + net.tone} />
            {net.label}
          </small>
        </div>
        <button className='tool' onClick={openSettings} aria-label='Settings' title='Settings'>
          <Icon name='gear' />
        </button>
      </div>
    </nav>
  )
}

// Only your connection to the network; how the open room is doing is shown
// once, under its name in the toolbar.
function network(online: boolean) {
  return online ? { tone: 'on', label: 'Online' } : { tone: '', label: 'Offline' }
}
