import { useState } from 'react'

export default function Welcome({ onSubmit }) {
  const [value, setValue] = useState('')
  const name = value.trim()

  function submit(event) {
    event.preventDefault()
    if (name) onSubmit(name)
  }

  return (
    <main className='center'>
      <form className='card' onSubmit={submit}>
        <h1>Pear chat demo</h1>
        <p>Chat directly with other peers. There is no server and no account.</p>
        <label htmlFor='name'>What should people call you?</label>
        <input
          id='name'
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={40}
          autoComplete='off'
          aria-describedby='name-hint'
          autoFocus
        />
        <p id='name-hint' className='hint'>
          Stored on this device and shown next to your messages. You can change it later.
        </p>
        <button className='primary' type='submit' disabled={!name}>
          Continue
        </button>
      </form>
    </main>
  )
}
