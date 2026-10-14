import { useEffect, useRef, useState } from 'react'
import Icon from './icons.jsx'

const bridge = window.bridge

export default function Composer({ onSend, onTyping, roomKey }) {
  const [text, setText] = useState('')
  const input = useRef(null)
  const ready = text.trim().length > 0

  const idle = useRef(null)

  // A new room starts with the cursor in the message field.
  useEffect(() => {
    setText('')
    input.current.focus()
  }, [roomKey])

  // Typing stops when you send, clear the field, leave it, or pause for a while.
  function stopTyping() {
    clearTimeout(idle.current)
    onTyping(false)
  }

  function noteTyping(value) {
    if (!value.trim()) return stopTyping()
    onTyping(true)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => onTyping(false), 4000)
  }

  useEffect(() => stopTyping, [roomKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event) {
    event.preventDefault()
    if (!ready) return
    onSend(text.trim())
    stopTyping()
    setText('')
    input.current.style.height = 'auto'
  }

  function onKeyDown(event) {
    // Return sends, Shift+Return adds a line; isComposing keeps IME input intact.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  function onChange(event) {
    setText(event.target.value)
    noteTyping(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = Math.min(event.target.scrollHeight, 120) + 'px'
  }

  function openEmoji() {
    input.current.focus()
    bridge.emoji()
  }

  return (
    <form className='composer' onSubmit={submit}>
      <div className='composer-field'>
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          maxLength={4000}
          placeholder='Message'
          aria-label='Message'
        />
        <button
          type='button'
          className='tool small'
          onClick={openEmoji}
          aria-label='Emoji and symbols'
          title='Emoji & Symbols'
        >
          <Icon name='smile' />
        </button>
        {/* The arrow appears once there is something to send, as in Messages. */}
        <button
          className='send'
          type='submit'
          data-ready={ready}
          disabled={!ready}
          aria-label='Send'
          title='Send'
        >
          <Icon name='send' size={15} weight='bold' />
        </button>
      </div>
    </form>
  )
}
