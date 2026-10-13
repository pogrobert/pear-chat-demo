import { useEffect, useState } from 'react'
import { statusOf } from './useChat.js'
import Timeline from './Timeline.jsx'
import Composer from './Composer.jsx'

export default function Room({ state, name, online, onSend, onLeave, onRename }) {
  const { status, peers, items, syncedLength, catchup } = state
  const connection = describeConnection(status, peers, online)
  const waiting = items.filter((item) => statusOf(item, syncedLength) === 'pending').length

  return (
    <div className='room'>
      <header className='bar'>
        <h1>Pear chat demo</h1>
        <p className={'pill ' + connection.tone} role='status'>
          <span className='dot' aria-hidden='true' />
          {connection.label}
        </p>
      </header>

      <main className='main'>
        <Catchup catchup={catchup} />
        <Timeline state={state} online={online} />
        {waiting > 0 && status !== 'connected' && (
          <p className='waiting' role='status'>
            {waiting === 1 ? '1 message is' : `${waiting} messages are`} saved on this device and
            will sync when a peer is here.
          </p>
        )}
        <Composer onSend={onSend} />
      </main>

      <aside className='side' aria-label='Room details'>
        <section>
          <h2>Room key</h2>
          <p className='mono key'>{state.key}</p>
          <CopyButton text={state.key} />
          <p className='hint'>Anyone with this key can read and write in this room.</p>
        </section>

        <section>
          <h2>In this room</h2>
          <ul className='people'>
            <li>
              <span className='dot on' aria-hidden='true' />
              <NameEditor name={name} onRename={onRename} />
            </li>
            {peers.map((peer) => (
              <li key={peer.id}>
                <span className='dot on' aria-hidden='true' />
                {peer.name}
              </li>
            ))}
          </ul>
          {peers.length === 0 && <p className='hint'>Just you for now.</p>}
        </section>

        <LeaveButton onLeave={onLeave} />
      </aside>
    </div>
  )
}

function describeConnection(status, peers, online) {
  if (!online) return { tone: 'off', label: 'You’re offline' }
  if (status === 'connected') {
    const who = peers.length === 1 ? peers[0].name : `${peers.length} peers`
    return { tone: 'on', label: `Connected to ${who}` }
  }
  if (status === 'alone') return { tone: 'idle', label: 'No one else is here' }
  return { tone: 'busy', label: 'Looking for peers…' }
}

// Shown while missed messages are downloading, then briefly once they are in.
function Catchup({ catchup }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!catchup) return
    setVisible(true)
    if (catchup.remaining > 0) return
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [catchup])

  if (!catchup || !visible) return null
  const { remaining, total } = catchup
  const done = total - remaining

  return (
    <div className='catchup' role='status'>
      {remaining > 0 ? (
        <>
          <span>
            Catching up… {done} of {total} missed {total === 1 ? 'message' : 'messages'}
          </span>
          <progress value={done} max={total} aria-label='Catching up' />
        </>
      ) : (
        <span>
          You’re up to date. {total} missed {total === 1 ? 'message' : 'messages'} received.
        </span>
      )}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    await window.bridge.copy(text)
    setCopied(true)
  }

  return (
    <button onClick={copy}>
      <span role='status'>{copied ? 'Copied' : 'Copy key'}</span>
    </button>
  )
}

function NameEditor({ name, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  function submit(event) {
    event.preventDefault()
    if (value.trim()) onRename(value.trim())
    setEditing(false)
  }

  if (!editing) {
    return (
      <>
        <span className='grow'>{name} (you)</span>
        <button
          className='link'
          onClick={() => {
            setValue(name)
            setEditing(true)
          }}
        >
          Rename
        </button>
      </>
    )
  }

  return (
    <form className='grow' onSubmit={submit}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}
        onBlur={() => setEditing(false)}
        maxLength={40}
        aria-label='Your display name'
        autoFocus
      />
    </form>
  )
}

// Leaving forgets the key on this device, so ask first.
function LeaveButton({ onLeave }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button className='link leave' onClick={() => setConfirming(true)}>
        Leave room
      </button>
    )
  }

  return (
    <section className='leave' role='group' aria-label='Leave room?'>
      <p className='hint'>You’ll need the key to come back. Copy it first if you want to return.</p>
      <button onClick={onLeave} autoFocus>
        Leave
      </button>{' '}
      <button className='link' onClick={() => setConfirming(false)}>
        Stay
      </button>
    </section>
  )
}
