import { useRef, useState } from 'react'

export default function Composer({ onSend, alone }) {
  const [text, setText] = useState('')
  const input = useRef(null)

  function submit(event) {
    event.preventDefault()
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
    input.current.style.height = 'auto'
    input.current.focus()
  }

  function onKeyDown(event) {
    // Enter sends; Shift+Enter adds a line. isComposing keeps IME input intact.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  function onChange(event) {
    setText(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = Math.min(event.target.scrollHeight, 140) + 'px'
  }

  return (
    <form className='composer' onSubmit={submit}>
      <textarea
        ref={input}
        rows={1}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        maxLength={4000}
        placeholder={
          alone ? 'Write a message. It will be delivered when a peer is here.' : 'Write a message'
        }
        aria-label='Message'
        aria-describedby='composer-hint'
        autoFocus
      />
      <button className='primary' type='submit' disabled={!text.trim()}>
        Send
      </button>
      <p id='composer-hint' className='hint'>
        Enter to send, Shift+Enter for a new line
      </p>
    </form>
  )
}
