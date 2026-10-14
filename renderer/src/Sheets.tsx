import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent
} from 'react'

interface SheetProps {
  title: string
  onCancel(): void
  children: ReactNode
}

// A Mac-style sheet: modal, drops from the top of the window, Escape cancels,
// Return confirms the default button.
function Sheet({ title, onCancel, children }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  function cancel(event: SyntheticEvent) {
    event.preventDefault()
    onCancel()
  }

  return (
    <dialog className='sheet' ref={dialog} onCancel={cancel} aria-labelledby='sheet-title'>
      <h2 id='sheet-title'>{title}</h2>
      {children}
    </dialog>
  )
}

interface NameSheetProps {
  name: string
  onSave(name: string): void
  onCancel(): void
}

export function NameSheet({ name, onSave, onCancel }: NameSheetProps) {
  const [value, setValue] = useState(name)
  const next = value.trim()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (next) onSave(next)
  }

  return (
    <Sheet title='Change Display Name' onCancel={onCancel}>
      <form onSubmit={submit}>
        <p>People see this name next to your messages.</p>
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
          <button type='button' onClick={onCancel}>
            Cancel
          </button>
          <button className='default' type='submit' disabled={!next}>
            Save
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

interface JoinSheetProps {
  error: keyof typeof errors | null
  onJoin(key: string): void
  onCancel(): void
}

export function JoinSheet({ error: lastError, onJoin, onCancel }: JoinSheetProps) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const error = submitted ? lastError : null // ignore errors from an earlier attempt
  const input = useRef<HTMLInputElement>(null)

  // Put the cursor back where the problem is.
  useEffect(() => {
    if (!error) return
    setBusy(false)
    input.current?.select()
  }, [error])

  function submit(event: FormEvent) {
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
            {errors[error]}
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
