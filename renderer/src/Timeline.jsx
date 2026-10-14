import { useEffect, useRef, useState } from 'react'
import { statusOf } from './useChat.js'
import Icon from './icons.jsx'
import { Avatar } from './Sidebar.jsx'

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const date = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })

const GAP = 15 * 60 * 1000 // a new time heading after 15 quiet minutes, like Messages
const DAY = 864e5

const delivery = {
  pending: {
    icon: 'clock',
    label: 'Waiting for a peer',
    title: 'Saved on this Mac. No peer has it yet.'
  },
  synced: { icon: 'check', label: 'Delivered', title: 'At least one peer has this message.' },
  failed: { icon: 'alert', label: 'Not Delivered', title: 'Could not save this message.' }
}

export default function Timeline({
  roomKey,
  items,
  syncedLength,
  receipts,
  typing,
  group,
  onSeen,
  empty
}) {
  const list = useRef(null)
  const atBottom = useRef(true)
  const [unseen, setUnseen] = useState(false)

  // Only messages that arrive while the room is open animate in. History
  // that loads when the room opens appears at once, so nothing slides around.
  const known = useRef(null)
  if (known.current?.room !== roomKey) {
    known.current = { room: roomKey, ids: new Set(), live: false }
  }
  useEffect(() => {
    const room = known.current
    const timer = setTimeout(() => (room.live = true), 800)
    return () => clearTimeout(timer)
  }, [roomKey])
  function isNew(item) {
    const fresh = known.current.live && !known.current.ids.has(item.id)
    known.current.ids.add(item.id)
    return fresh
  }

  // Follow new messages only if the reader is already at the bottom. Being at
  // the bottom also means they have seen everything, which is what read
  // receipts report.
  useEffect(() => {
    if (atBottom.current) {
      list.current.scrollTop = list.current.scrollHeight
      onSeen()
    } else setUnseen(true)
  }, [items, typing, onSeen])

  // Coming back to the window counts as seeing what arrived meanwhile.
  useEffect(() => {
    const onFocus = () => atBottom.current && onSeen()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [onSeen])

  function onScroll() {
    const el = list.current
    const was = atBottom.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom.current) setUnseen(false)
    if (atBottom.current && !was) onSeen()
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
        {messages.length === 0 && !typing.length
          ? empty
          : items.map((item, index) => {
              const previous = items[index - 1]
              const next = items[index + 1]
              const heading =
                !previous || item.at - previous.at > GAP || !sameDay(previous.at, item.at)
              const enter = isNew(item)
              if (item.kind === 'notice') {
                return (
                  <div key={item.id}>
                    {heading && <TimeHeading at={item.at} />}
                    <p className={'notice' + (enter ? ' enter' : '')}>{item.text}</p>
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
                    enter={enter}
                    status={statusOf(item, syncedLength)}
                    showStatus={item === lastMine}
                    seenBy={item === lastMine ? seenBy(receipts, item) : []}
                    group={group}
                  />
                </div>
              )
            })}
        {typing.length > 0 && <Typing names={typing} />}
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

function Message({ message, first, last, enter, status, showStatus, group, seenBy }) {
  // "Seen" is stronger than "Delivered": the person, not just their Mac, has it.
  if (status === 'synced' && seenBy.length) status = 'seen'
  const info = status && (status === 'seen' ? seenInfo(seenBy) : delivery[status])
  // Only my latest message says where it stands (earlier pending ones are
  // just paler), unless one failed.
  const labelled = info && (showStatus || status === 'failed')
  const classes = ['message', message.mine && 'mine', first && 'first', last && 'last', status]

  return (
    <div
      className={classes
        .concat(enter && 'enter')
        .filter(Boolean)
        .join(' ')}
    >
      {first && !message.mine && (
        <p className={'author' + (group ? ' indented' : '')}>{message.name}</p>
      )}
      <div className='bubble-row'>
        {/* In a group, who said it sits next to their last bubble, as in Messages. */}
        {group && !message.mine && (
          <span className='bubble-avatar'>
            {last && <Avatar names={[message.name]} size='small' />}
          </span>
        )}
        <p className='bubble' title={full.format(message.at)}>
          {message.text}
        </p>
      </div>
      {labelled && (
        <p key={info.label} className={'delivery ' + status} title={info.title}>
          {info.icon && status !== 'synced' && <Icon name={info.icon} size={13} />}
          {info.label}
        </p>
      )}
    </div>
  )
}

// "Today 9:41 PM", "Yesterday 9:41 PM", "Monday 9:41 PM", "Wed, 16 Sep at 9:41 PM"
function TimeHeading({ at }) {
  const old = Date.now() - at >= 6 * DAY
  return (
    <p className='time-heading'>
      <strong>{dayName(at)}</strong> {old ? 'at ' : ''}
      {time.format(at)}
    </p>
  )
}

function dayName(at) {
  if (sameDay(at, Date.now())) return 'Today'
  if (sameDay(at, Date.now() - DAY)) return 'Yesterday'
  if (Date.now() - at < 6 * DAY) return weekday.format(at)
  return date.format(at)
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function sameAuthor(a, b) {
  if (!a || !b || a.kind === 'notice' || b.kind === 'notice') return false
  return a.mine === b.mine && a.writer === b.writer && a.name === b.name
}

// Everyone who has read at least up to this message.
function seenBy(receipts, message) {
  if (message.seq === undefined) return []
  return receipts.filter((receipt) => receipt.length > message.seq).map((receipt) => receipt.name)
}

function seenInfo(names) {
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  return { label: 'Seen by ' + who, title: `${names.join(', ')} read this on their device.` }
}

// Three dots in a bubble while someone is writing. Never stored anywhere.
function Typing({ names }) {
  const who = names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`
  return (
    <div className='typing' role='status'>
      <p className='author'>{who}</p>
      <p className='bubble typing-bubble' aria-label={`${who} is typing`}>
        <i />
        <i />
        <i />
      </p>
    </div>
  )
}
