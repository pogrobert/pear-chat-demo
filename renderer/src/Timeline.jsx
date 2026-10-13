import { useEffect, useRef, useState } from 'react'
import { statusOf } from './useChat.js'

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

const statusLabels = {
  pending: 'Saved here, not yet synced',
  synced: 'Synced',
  failed: 'Couldn’t save this message'
}

export default function Timeline({ state, online }) {
  const { items, syncedLength } = state
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

  function jumpToLatest() {
    list.current.scrollTop = list.current.scrollHeight
  }

  const hasMessages = items.some((item) => item.kind !== 'notice')
  const lastMine = items.findLast((item) => item.mine)

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
        {!hasMessages && <EmptyState state={state} online={online} />}
        {hasMessages &&
          items.map((item, index) => {
            const previous = items[index - 1]
            const newDay = !previous || day.format(previous.at) !== day.format(item.at)
            return (
              <div key={item.id}>
                {newDay && <p className='day'>{day.format(item.at)}</p>}
                {item.kind === 'notice' ? (
                  <p className='notice'>{item.text}</p>
                ) : (
                  <Message
                    message={item}
                    status={statusOf(item, syncedLength)}
                    showLabel={item === lastMine}
                    grouped={!newDay && isSameAuthor(previous, item)}
                  />
                )}
              </div>
            )
          })}
      </div>
      {unseen && (
        <button className='jump' onClick={jumpToLatest}>
          New messages ↓
        </button>
      )}
    </div>
  )
}

function isSameAuthor(previous, message) {
  if (!previous || previous.kind === 'notice') return false
  return (
    previous.mine === message.mine &&
    previous.writer === message.writer &&
    previous.name === message.name &&
    message.at - previous.at < 5 * 60 * 1000
  )
}

function Message({ message, status, showLabel, grouped }) {
  // Older synced messages only need the tick. Anything unusual gets words.
  const labelled = showLabel || status === 'pending' || status === 'failed'

  return (
    <article className={'message' + (message.mine ? ' mine' : '') + (grouped ? ' grouped' : '')}>
      {!grouped && (
        <header>
          <span className='author'>{message.mine ? 'You' : message.name}</span>
          <time dateTime={new Date(message.at).toISOString()}>{time.format(message.at)}</time>
        </header>
      )}
      <p className='text'>{message.text}</p>
      {status && (
        <p className={'delivery ' + status}>
          <StatusIcon status={status} />
          <span className={labelled ? '' : 'sr-only'}>{statusLabels[status]}</span>
        </p>
      )}
    </article>
  )
}

function StatusIcon({ status }) {
  const paths = {
    pending: <path d='M8 4.5V8l2.2 1.4M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z' />,
    synced: <path d='m3.5 8.5 3 3 6-7' />,
    failed: <path d='M8 4.5v4M8 11v.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z' />
  }
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' aria-hidden='true'>
      {paths[status]}
    </svg>
  )
}

function EmptyState({ state, online }) {
  const { status, peers, created } = state

  if (!online) {
    return (
      <Empty title='You’re offline'>
        You can still write. Messages are saved on this device and sync when you’re back online and
        a peer is here.
      </Empty>
    )
  }
  if (status === 'connected') {
    return (
      <Empty title='You’re connected'>
        {peers.length === 1 ? `${peers[0].name} is here.` : `${peers.length} peers are here.`} Say
        hello.
      </Empty>
    )
  }
  if (status === 'alone') {
    return created ? (
      <Empty title='Your room is ready'>
        Share the room key with someone to start chatting. Nothing is stored on a server, so the
        room is reachable only while one of you has the app open.
      </Empty>
    ) : (
      <Empty title='No one else is here'>
        Messages you write now are saved on this device and delivered when a peer comes online. If
        you expected someone, check that the key is right.
      </Empty>
    )
  }
  return (
    <Empty title='Looking for peers…' busy>
      Announcing this room and searching for others in it. This usually takes a few seconds.
    </Empty>
  )
}

function Empty({ title, busy, children }) {
  return (
    <div className='empty'>
      {busy && <span className='spinner' aria-hidden='true' />}
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}
