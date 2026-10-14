import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import Icon from './icons.tsx'
import { useChat } from './state/chat.ts'

export default function Composer() {
  const roomKey = useChat((s) => s.key)
  const send = useChat((s) => s.send)
  const setTyping = useChat((s) => s.setTyping)
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ready = text.trim().length > 0

  // A new room starts with the cursor in the message field.
  useEffect(() => {
    setText('')
    input.current?.focus()
  }, [roomKey])

  // Typing stops when you send, clear the field, leave it, or pause for a while.
  function stopTyping() {
    clearTimeout(idle.current)
    setTyping(false)
  }

  function noteTyping(value: string) {
    if (!value.trim()) return stopTyping()
    setTyping(true)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setTyping(false), 4000)
  }

  useEffect(() => stopTyping, [roomKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    send(text.trim())
    stopTyping()
    setText('')
    if (input.current) input.current.style.height = 'auto'
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Return sends, Shift+Return adds a line; isComposing keeps IME input intact.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value)
    noteTyping(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = Math.min(event.target.scrollHeight, 120) + 'px'
  }

  function openEmoji() {
    input.current?.focus()
    window.bridge.emoji()
  }

  // Emoji on the left, send on the right, the field in between just for text.
  return (
    <form className='composer' onSubmit={submit}>
      <button
        type='button'
        className='composer-button'
        onClick={openEmoji}
        aria-label='Emoji and symbols'
        title='Emoji & Symbols'
      >
        <Icon name='smile' size={20} />
      </button>
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
      </div>
      {/* Always in the same place; it turns blue once there is something to send. */}
      <button
        className='send'
        type='submit'
        data-ready={ready}
        disabled={!ready}
        aria-label='Send'
        title='Send'
      >
        <Icon name='send' size={16} weight='bold' />
      </button>
    </form>
  )
}
