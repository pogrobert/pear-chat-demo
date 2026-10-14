import { useState } from 'react'
import Icon from './icons.jsx'
import { roomLabel } from './useRooms.js'

const bridge = window.bridge
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const date = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
})

export default function Sidebar({ rooms, current, onSelect, onCopy, onRemove, onAdd, onHide }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q
    ? rooms.filter((room) =>
        (roomLabel(room) + ' ' + (room.last?.text || '')).toLowerCase().includes(q)
      )
    : rooms

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

  return (
    <nav className='sidebar' aria-label='Rooms'>
      <div className='sidebar-top drag'>
        <button className='tool' onClick={onHide} aria-label='Hide sidebar' title='Hide Sidebar'>
          <Icon name='sidebar' />
        </button>
        <button
          className='tool'
          onClick={onAdd}
          aria-label='New room'
          title='New Room or Join Room'
        >
          <Icon name='compose' />
        </button>
      </div>

      <label className='search'>
        <Icon name='search' size={15} />
        <input
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
          placeholder='Search'
          aria-label='Search rooms'
          spellCheck={false}
        />
      </label>

      <div className='sidebar-scroll'>
        {rooms.length === 0 ? (
          <p className='sidebar-empty'>No Rooms</p>
        ) : shown.length === 0 ? (
          <p className='sidebar-empty'>No Results</p>
        ) : (
          <ul className='rooms' onKeyDown={onKeyDown}>
            {shown.map((room) => (
              <li key={room.key}>
                <button
                  id={'room-' + room.key}
                  className='room-row'
                  aria-current={room.key === current ? 'true' : undefined}
                  onClick={() => onSelect(room.key)}
                  onContextMenu={(event) => onContextMenu(event, room)}
                >
                  <Avatar names={room.people} />
                  <span className='room-text'>
                    <span className='room-line'>
                      <span className='room-name'>{roomLabel(room)}</span>
                      {room.last && <span className='room-time'>{when(room.last.at)}</span>}
                    </span>
                    <span className='room-preview'>
                      {room.last ? `${room.last.name}: ${room.last.text}` : 'No messages yet'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  )
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
    .map((name) => name[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={'avatar ' + size}
      style={names.length === 1 ? { background: colorFor(names[0]) } : undefined}
      aria-hidden='true'
    >
      {initials || <Icon name='bubbles' size={size === 'large' ? 22 : 13} weight='fill' />}
      {online && <span className='online' />}
    </span>
  )
}

// Like Messages: a time today, then "Yesterday", a weekday, or a date.
function when(at) {
  const day = (offset) => new Date(Date.now() - offset * 864e5).toDateString()
  const then = new Date(at).toDateString()
  if (then === day(0)) return time.format(at)
  if (then === day(1)) return 'Yesterday'
  if (Date.now() - at < 6 * 864e5) return weekday.format(at)
  return date.format(at)
}
