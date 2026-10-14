import { useEffect, useRef, useState } from 'react'
import Icon from './icons.jsx'
import { Avatar } from './Sidebar.jsx'
import { usePresence } from './usePresence.js'

// The info button at the trailing end of the toolbar, as in Messages: who is
// in the room, who is here now, and the room key.
export default function RoomDetails({ people, peers, name, roomKey, copied, onCopy, onRemove }) {
  const [open, setOpen] = useState(false)
  const [mounted, state] = usePresence(open, 160)
  const pill = useRef(null)
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector('button')?.focus()
    function onPointer(event) {
      const inside = panel.current?.contains(event.target) || pill.current.contains(event.target)
      if (!inside) setOpen(false)
    }
    function onKey(event) {
      if (event.key !== 'Escape') return
      setOpen(false)
      pill.current.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => setOpen(false), [roomKey])

  return (
    <div className='room-details'>
      <button
        ref={pill}
        className='tool'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup='dialog'
        aria-label='Room details'
        title='Details'
      >
        <Icon name='info' />
      </button>

      {mounted && (
        <div
          className='popover'
          data-state={state}
          ref={panel}
          role='dialog'
          aria-label='Room details'
        >
          <h2>{presence(people, peers)}</h2>
          <ul className='people'>
            <li>
              <Avatar names={[name]} size='small' online />
              <span className='grow'>{name}</span>
              <span className='you'>You</span>
            </li>
            {peers.map((peer) => (
              <li key={peer.id}>
                <Avatar names={[peer.name]} size='small' online />
                <span className='grow'>{peer.name}</span>
              </li>
            ))}
          </ul>
          {peers.length === 0 && <p className='hint'>No one else is connected right now.</p>}

          <h2>Room Key</h2>
          <p className='mono key'>{roomKey}</p>
          <p className='hint'>Anyone with this key can read and write in this room.</p>
          <div className='popover-buttons'>
            <button onClick={onCopy}>
              <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy Key'}
            </button>
            <button className='destructive' onClick={onRemove}>
              Remove Room…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// "2 people · 1 here": everyone who has been in the room, and who is connected now.
function presence(people, peers) {
  const total = people.length + 1
  return `${total} ${total === 1 ? 'person' : 'people'} · ${peers.length + 1} here`
}
