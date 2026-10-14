import Icon from './icons.jsx'
import { roomLabel } from './useRooms.js'

const bridge = window.bridge
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const date = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  year: '2-digit'
})

export default function Sidebar({
  rooms,
  current,
  peers,
  name,
  onSelect,
  onAdd,
  onCopy,
  onRemove,
  onHide
}) {
  // Arrow keys move through the list, as in any Mac source list.
  function onKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = rooms.findIndex((room) => room.key === current)
    const next = rooms[index + (event.key === 'ArrowDown' ? 1 : -1)]
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
      </div>

      <div className='sidebar-scroll'>
        <div className='section-header'>
          <h2>Rooms</h2>
          <button
            className='tool small'
            onClick={onAdd}
            aria-label='New or join room'
            title='New Room or Join Room'
          >
            <Icon name='plus' />
          </button>
        </div>

        {rooms.length === 0 ? (
          <p className='sidebar-empty'>No rooms yet</p>
        ) : (
          <ul className='rooms' onKeyDown={onKeyDown}>
            {rooms.map((room) => (
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

        {current && (
          <>
            <div className='section-header'>
              <h2>Here Now</h2>
            </div>
            <ul className='people'>
              <li>
                <Avatar names={[name]} small />
                <span className='grow'>{name}</span>
                <span className='you'>You</span>
              </li>
              {peers.map((peer) => (
                <li key={peer.id}>
                  <Avatar names={[peer.name]} small online />
                  <span className='grow'>{peer.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </nav>
  )
}

export function Avatar({ names, small, online }) {
  const initials = names.length
    ? names
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : null
  return (
    <span className={'avatar' + (small ? ' small' : '')} aria-hidden='true'>
      {initials || <Icon name='bubbles' size={small ? 12 : 18} />}
      {online && <span className='online' />}
    </span>
  )
}

function when(at) {
  const today = new Date().toDateString() === new Date(at).toDateString()
  return today ? time.format(at) : date.format(at)
}
