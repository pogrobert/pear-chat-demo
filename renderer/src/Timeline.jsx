import { useEffect, useRef, useState } from 'react'
import { statusOf } from './useChat.js'
import Icon from './icons.jsx'

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const date = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
})
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })

const GAP = 15 * 60 * 1000 // a new time heading after 15 quiet minutes, like Messages

const delivery = {
  pending: {
    icon: 'clock',
    label: 'Waiting for a peer',
    title: 'Saved on this Mac. No peer has it yet.'
  },
  synced: { icon: 'check', label: 'Delivered', title: 'At least one peer has this message.' },
  failed: { icon: 'alert', label: 'Not Delivered', title: 'Could not save this message.' }
}

export default function Timeline({ items, syncedLength, empty }) {
  const list = useRef(null)
  const atBottom = useRef(true)
  const [unseen, setUnseen] = useState(false)

  // Follow new messages only if the reader is already at the bottom.
  useEffect(() => {
    if (atBottom.current) list.current.scrollTop = list.current.scrollHeight
    else setUnseen(true)
  }, [items])

  function onScroll() {
    const el = list.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom.current) setUnseen(false)
  }

  const messages = items.filter((item) => item.kind !== 'notice')
  const lastMine = messages.findLast((item) => item.mine)

  return (
    <div className='timeline-wrap'>
      <div
        className='timeline'
        ref={list}
        onScroll={onScroll}
        role='log'
        aria-label='Messages'
        tabIndex={0}
      >
        {messages.length === 0
          ? empty
          : items.map((item, index) => {
              const previous = items[index - 1]
              const next = items[index + 1]
              const heading =
                !previous || item.at - previous.at > GAP || !sameDay(previous.at, item.at)
              if (item.kind === 'notice') {
                return (
                  <div key={item.id}>
                    {heading && <TimeHeading at={item.at} />}
                    <p className='notice'>{item.text}</p>
                  </div>
                )
              }
              const first = heading || !sameAuthor(previous, item)
              const last = !sameAuthor(item, next) || (next && next.at - item.at > GAP)
              return (
                <div key={item.id}>
                  {heading && <TimeHeading at={item.at} />}
                  <Message
                    message={item}
                    first={first}
                    last={last}
                    status={statusOf(item, syncedLength)}
                    showStatus={item === lastMine}
                  />
                </div>
              )
            })}
      </div>
      {unseen && (
        <button
          className='jump'
          onClick={() => (list.current.scrollTop = list.current.scrollHeight)}
        >
          New Messages
        </button>
      )}
    </div>
  )
}

function Message({ message, first, last, status, showStatus }) {
  const info = status && delivery[status]
  // Only my latest message says where it stands (earlier pending ones are
  // just faded), unless one failed.
  const labelled = info && (showStatus || status === 'failed')

  return (
    <div
      className={['message', message.mine && 'mine', first && 'first', last && 'last', status]
        .filter(Boolean)
        .join(' ')}
    >
      {first && !message.mine && <p className='author'>{message.name}</p>}
      <p className='bubble' title={full.format(message.at)}>
        {message.text}
      </p>
      {labelled && (
        <p className={'delivery ' + status} title={info.title}>
          {status !== 'synced' && <Icon name={info.icon} size={12} />}
          {info.label}
        </p>
      )}
    </div>
  )
}

function TimeHeading({ at }) {
  return (
    <p className='time-heading'>
      <strong>{dayName(at)}</strong> {time.format(at)}
    </p>
  )
}

function dayName(at) {
  const day = new Date(at)
  const today = new Date()
  const yesterday = new Date(Date.now() - 864e5)
  if (sameDay(day, today)) return 'Today'
  if (sameDay(day, yesterday)) return 'Yesterday'
  if (Date.now() - at < 6 * 864e5) return weekday.format(at)
  return date.format(at)
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function sameAuthor(a, b) {
  if (!a || !b || a.kind === 'notice' || b.kind === 'notice') return false
  return a.mine === b.mine && a.writer === b.writer && a.name === b.name
}
