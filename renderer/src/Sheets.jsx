import { useEffect, useRef, useState } from 'react'

// A Mac-style sheet: modal, drops from the top of the window, Escape cancels
// (unless it can't be cancelled), Return confirms the default button.
function Sheet({ title, onCancel, children }) {
  const dialog = useRef(null)

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  function cancel(event) {
    event.preventDefault()
    if (onCancel) onCancel()
  }

  return (
    <dialog className='sheet' ref={dialog} onCancel={cancel} aria-labelledby='sheet-title'>
      <h2 id='sheet-title'>{title}</h2>
      {children}
    </dialog>
  )
}

export function NameSheet({ firstRun, name = '', onSave, onCancel }) {
  const [value, setValue] = useState(name)
  const next = value.trim()

  function submit(event) {
    event.preventDefault()
    if (next) onSave(next)
  }

  return (
    <Sheet
      title={firstRun ? 'Welcome to Pear Chat' : 'Change Display Name'}
      onCancel={firstRun ? null : onCancel}
    >
      <form onSubmit={submit}>
        <p>
          {firstRun
            ? 'Chat directly with other people, with no server and no account. What should people call you?'
            : 'People see this name next to your messages.'}
        </p>
        <label htmlFor='name'>Display name</label>
        <input
          id='name'
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={40}
          autoComplete='off'
          autoFocus
        />
        <p className='hint'>Stored on this Mac.</p>
        <div className='sheet-buttons'>
          {!firstRun && (
            <button type='button' onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className='default' type='submit' disabled={!next}>
            {firstRun ? 'Continue' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

const errors = {
  'invalid-key': 'That doesn’t look like a room key. A key is 52 letters and numbers.',
  storage: 'Couldn’t open this room’s storage on this Mac.'
}

export function JoinSheet({ error: lastError, onJoin, onCancel }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const error = submitted ? lastError : null // ignore errors from an earlier attempt
  const input = useRef(null)

  // Put the cursor back where the problem is.
  useEffect(() => {
    if (!error) return
    setBusy(false)
    input.current.select()
  }, [error])

  function submit(event) {
    event.preventDefault()
    if (!key.trim()) return
    setBusy(true)
    setSubmitted(true)
    onJoin(key.trim())
  }

  return (
    <Sheet title='Join a Room' onCancel={onCancel}>
      <form onSubmit={submit}>
        <p>Paste the room key someone shared with you.</p>
        <label htmlFor='key'>Room key</label>
        <input
          id='key'
          ref={input}
          className='mono'
          value={key}
          onChange={(event) => setKey(event.target.value)}
          spellCheck={false}
          autoComplete='off'
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'key-error' : undefined}
          autoFocus
        />
        {error && (
          <p id='key-error' className='error' role='alert'>
            {errors[error] || 'Couldn’t join that room. Please try again.'}
          </p>
        )}
        <div className='sheet-buttons'>
          <button type='button' onClick={onCancel}>
            Cancel
          </button>
          <button className='default' type='submit' disabled={busy || !key.trim()}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
