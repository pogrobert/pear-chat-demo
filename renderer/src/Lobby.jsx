import { useEffect, useRef, useState } from 'react'

const errors = {
  'invalid-key': 'That doesn’t look like a room key. A key is 52 letters and numbers.',
  storage: 'Couldn’t open this room’s storage. Is another copy of the app using it?'
}

export default function Lobby({ name, busy, error, onCreate, onJoin }) {
  const [key, setKey] = useState('')
  const input = useRef(null)

  // Put the cursor back where the problem is.
  useEffect(() => {
    if (error) input.current.focus()
  }, [error])

  function submit(event) {
    event.preventDefault()
    if (key.trim()) onJoin(key.trim())
  }

  return (
    <main className='center'>
      <div className='card' aria-busy={busy}>
        <h1>Hi, {name}</h1>
        <p>Start a new room, or join one with a key someone sent you.</p>

        <button className='primary' onClick={onCreate} disabled={busy} autoFocus>
          Create a room
        </button>

        <div className='divider'>or</div>

        <form onSubmit={submit}>
          <label htmlFor='key'>Room key</label>
          <input
            id='key'
            ref={input}
            className='mono'
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder='Paste a key'
            spellCheck={false}
            autoComplete='off'
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'key-error' : undefined}
          />
          {error && (
            <p id='key-error' className='error' role='alert'>
              {errors[error] || 'Couldn’t join that room. Please try again.'}
            </p>
          )}
          <button type='submit' disabled={busy || !key.trim()}>
            Join room
          </button>
        </form>

        <p className='hint' role='status'>
          {busy
            ? 'Opening room…'
            : 'Peers find each other through a distributed hash table and connect directly.'}
        </p>
      </div>
    </main>
  )
}
