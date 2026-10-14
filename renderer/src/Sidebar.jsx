import { useEffect, useState } from 'react'
import Icon from './icons.jsx'
import { roomLabel } from './useRooms.js'

const bridge = window.bridge

// A room key is 52 z-base-32 characters (or 64 hex); pear:// links work too.
const KEY = /^(pear:\/\/)?([a-z0-9]{52}|[0-9a-f]{64})$/i

// Rooms you have been in, and at the bottom, you and your connection to the
// network. Live presence ("2 here") is only known for the open room, because
// the app is connected to one room at a time; the others show how many
// people have been in them.
export default function Sidebar({
  rooms,
  current,
  peers,
  status,
  online,
  name,
  joinError,
  onSelect,
  onAdd,
  onJoinKey,
  onCopy,
  onRemove,
  onHide,
  onRename,
  onWelcome
}) {
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState(false)
  const q = query.trim()
  const isKey = KEY.test(q)
  const shown =
    q && !isKey
      ? rooms.filter((room) =>
          (roomLabel(room) + ' ' + (room.last?.text || '')).toLowerCase().includes(q.toLowerCase())
        )
      : rooms

  function joinKey() {
    setJoining(true)
    onJoinKey(q)
  }

  // A successful join opens the room; clear the field then.
  useEffect(() => {
    if (!joining || joinError || !current) return
    setQuery('')
    setJoining(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Arrow keys move through the list, as in any Mac source list.
  function onKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = shown.findIndex((room) => room.key === current)
    const next = shown[index + (event.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      onSelect(next.key)
      document.getElementById('room-' + next.key)?.focus()
    }
  }

  async function onContextMenu(event, room) {
    event.preventDefault()
    const choice = await bridge.popup([
      { id: 'copy', label: 'Copy Room Key' },
      { separator: true },
      { id: 'remove', label: 'Remove Room…' }
    ])
    if (choice === 'copy') onCopy(room.key)
    if (choice === 'remove') onRemove(room)
  }

  async function openSettings() {
    const choice = await bridge.popup([
      { id: 'rename', label: 'Change Display Name…' },
      { id: 'welcome', label: 'Show Welcome' }
    ])
    if (choice === 'rename') onRename()
    if (choice === 'welcome') onWelcome()
  }

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
                    onClick={() => onSelect(room.key)}
                    onContextMenu={(event) => onContextMenu(event, room)}
                    title={room.last ? `${room.last.name}: ${room.last.text}` : 'No messages yet'}
                  >
                    <Avatar names={room.people} size='medium' online={live} />
                    <span className='room-name'>{roomLabel(room)}</span>
                    <span className={'room-meta' + (live ? ' live' : '')}>
                      {meta(room, open, peers)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className='me-bar'>
        <Avatar names={[name]} size='me' />
        <div className='who'>
          <b>{name}</b>
          <small role='status'>
            <span className={'dot ' + network(online, current, status, peers).tone} />
            {network(online, current, status, peers).label}
          </small>
        </div>
        <button className='tool' onClick={openSettings} aria-label='Settings' title='Settings'>
          <Icon name='gear' />
        </button>
      </div>
    </nav>
  )
}

function meta(room, open, peers) {
  if (open && peers.length > 0) return `${peers.length + 1} here`
  if (open) return 'only you'
  return room.people.length ? `${room.people.length + 1} people` : 'just you'
}

function network(online, inRoom, status, peers) {
  if (!online) return { tone: '', label: 'Offline' }
  if (!inRoom) return { tone: 'on', label: 'Online' }
  if (peers.length > 0) {
    const n = peers.length
    return { tone: 'on', label: `Online · ${n} ${n === 1 ? 'peer' : 'peers'} connected` }
  }
  if (status === 'alone') return { tone: 'on', label: 'Online · no peers right now' }
  return { tone: 'busy', label: 'Online · looking for peers…' }
}

// A stable color per person, so the same name always looks the same.
const hues = [
  ['#ff9f6b', '#f26b3a'],
  ['#6fc3ff', '#2f8de4'],
  ['#8ee28a', '#3dae50'],
  ['#c39bff', '#8a5be0'],
  ['#ffcf5c', '#e7a21f'],
  ['#ff8fb4', '#e0507e'],
  ['#6fe0d4', '#21a89a']
]

export function huesFor(name) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hues[hash % hues.length]
}

function colorFor(name) {
  const [top, bottom] = huesFor(name)
  return `linear-gradient(${top}, ${bottom})`
}

export function Avatar({ names, size = 'large', online }) {
  const initials = names
    .slice(0, 2)
    .map((person) => person[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={'avatar ' + size}
      style={names.length ? { background: colorFor(names[0]) } : undefined}
      aria-hidden='true'
    >
      {initials || <Icon name='bubbles' size={size === 'large' ? 22 : 14} weight='fill' />}
      {online && <span className='online' />}
    </span>
  )
}
