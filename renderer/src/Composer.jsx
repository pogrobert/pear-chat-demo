import { useEffect, useRef, useState } from 'react'
import Icon from './icons.jsx'

export default function Composer({ onSend, roomKey }) {
  const [text, setText] = useState('')
  const input = useRef(null)

  // A new room starts with the cursor in the message field.
  useEffect(() => {
    setText('')
    input.current.focus()
  }, [roomKey])

  function submit(event) {
    event.preventDefault()
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
    input.current.style.height = 'auto'
  }

  function onKeyDown(event) {
    // Return sends, Shift+Return adds a line; isComposing keeps IME input intact.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  function onChange(event) {
    setText(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = Math.min(event.target.scrollHeight, 120) + 'px'
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
          maxLength={4000}
          placeholder='Message'
          aria-label='Message'
        />
        <button
          className='send'
          type='submit'
          disabled={!text.trim()}
          aria-label='Send'
          title='Send'
        >
          <Icon name='send' size={14} />
        </button>
      </div>
    </form>
  )
}
