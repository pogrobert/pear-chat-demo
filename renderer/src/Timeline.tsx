import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useShallow } from 'zustand/react/shallow'
import Icon, { type IconName } from './icons.tsx'
import Avatar from './Avatar.tsx'
import { useChat } from './state/chat.ts'
import { deliveryOf, readersOf, type Delivery } from './state/chat-state.mts'
import type { Item, Message, Notice } from './types.ts'

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
const ENTER_MS = 600 // how long a new message counts as "just arrived"

type Row =
  | {
      key: string
      kind: 'message'
      message: Message
      heading: boolean
      first: boolean
      last: boolean
    }
  | { key: string; kind: 'notice'; notice: Notice; heading: boolean }
  | { key: 'typing'; kind: 'typing' }

interface Label {
  icon?: IconName
  label: string
  title: string
}

const delivery: Record<Delivery, Label> = {
  pending: {
    icon: 'clock',
    label: 'Waiting for a peer',
    title: 'Saved on this Mac. No peer has it yet.'
  },
  synced: { label: 'Delivered', title: 'At least one peer has this message.' },
  failed: { icon: 'alert', label: 'Not Delivered', title: 'Could not save this message.' }
}

interface Props {
  group: boolean
  empty: ReactNode
}

// The conversation. Only the rows on screen (plus a few either side) are in
// the DOM, so a room with thousands of messages scrolls as smoothly as one
// with ten. Rows have different heights, so each is measured once rendered.
export default function Timeline({ group, empty }: Props) {
  const { roomKey, items, syncedLength, receipts, typing, seen } = useChat(
    useShallow((s) => ({
      roomKey: s.key,
      items: s.items,
      syncedLength: s.syncedLength,
      receipts: s.receipts,
      typing: s.typing,
      seen: s.seen
    }))
  )
  const list = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [unseen, setUnseen] = useState(false)

  const rows = useMemo(() => buildRows(items, typing.length > 0), [items, typing.length > 0])
  const lastMine = useMemo(
    () => items.findLast((item): item is Message => item.kind !== 'notice' && item.mine),
    [items]
  )
  const hasMessages = items.some((item) => item.kind !== 'notice')
  const entered = useArrivals(roomKey, items)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    estimateSize: (index) => (rows[index].kind === 'message' ? 46 : 34),
    getItemKey: (index) => rows[index].key,
    overscan: 8,
    paddingStart: 8,
    paddingEnd: 12
  })
  const total = virtualizer.getTotalSize()

  // Follow new messages only if the reader is already at the bottom. Rows are
  // measured after they render, so this runs again whenever the total height
  // settles, keeping the newest message in view.
  useLayoutEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [rows, total])

  // Being at the bottom also means the reader has seen everything, which is
  // what read receipts report.
  useEffect(() => {
    if (atBottom.current) seen()
    else setUnseen(true)
  }, [items, typing, seen])

  // Coming back to the window counts as seeing what arrived meanwhile.
  useEffect(() => {
    const onFocus = () => atBottom.current && seen()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [seen])

  function onScroll() {
    const el = list.current!
    const was = atBottom.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom.current) setUnseen(false)
    if (atBottom.current && !was) seen()
  }

  function jumpToLatest() {
    atBottom.current = true
    virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }

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
        {!hasMessages && !typing.length ? (
          empty
        ) : (
          <div className='rows' style={{ height: total }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const row = rows[virtual.index]
              return (
                <div
                  key={virtual.key}
                  className='row'
                  data-index={virtual.index}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtual.start}px)` }}
                >
                  {row.kind === 'typing' ? (
                    <Typing names={typing} />
                  ) : (
                    <>
                      {row.heading && (
                        <TimeHeading at={row.kind === 'message' ? row.message.at : row.notice.at} />
                      )}
                      {row.kind === 'notice' ? (
                        <p className={'notice' + (entered(row.notice.id) ? ' enter' : '')}>
                          {row.notice.text}
                        </p>
                      ) : (
                        <Bubble
                          message={row.message}
                          first={row.first}
                          last={row.last}
                          enter={entered(row.message.id)}
                          status={deliveryOf(row.message, syncedLength)}
                          showStatus={row.message === lastMine}
                          readers={row.message === lastMine ? readersOf(receipts, row.message) : []}
                          group={group}
                        />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {unseen && (
        <button className='jump' onClick={jumpToLatest}>
          New Messages
        </button>
      )}
    </div>
  )
}

// Each row knows whether it starts a new time heading and where it sits in a
// run of bubbles from the same person, so rows render independently.
function buildRows(items: Item[], typing: boolean): Row[] {
  const rows: Row[] = items.map((item, index) => {
    const previous = items[index - 1]
    const next = items[index + 1]
    const heading = !previous || item.at - previous.at > GAP || !sameDay(previous.at, item.at)
    if (item.kind === 'notice') return { key: item.id, kind: 'notice', notice: item, heading }
    return {
      key: item.id,
      kind: 'message',
      message: item,
      heading,
      first: heading || !sameAuthor(previous, item),
      last: !sameAuthor(item, next) || (next !== undefined && next.at - item.at > GAP)
    }
  })
  if (typing) rows.push({ key: 'typing', kind: 'typing' })
  return rows
}

// Only messages that arrive while the room is open animate in, and only once:
// history that loads when the room opens appears at once, and a row scrolled
// back into view does not replay its entrance.
function useArrivals(roomKey: string | null, items: Item[]) {
  const state = useRef({
    room: null as string | null,
    known: new Set<string>(),
    arrived: new Map<string, number>(),
    live: false
  })
  const s = state.current
  if (s.room !== roomKey) {
    Object.assign(s, { room: roomKey, known: new Set(), arrived: new Map(), live: false })
  }

  for (const item of items) {
    if (s.known.has(item.id)) continue
    s.known.add(item.id)
    if (s.live) s.arrived.set(item.id, Date.now())
  }

  useEffect(() => {
    const timer = setTimeout(() => (state.current.live = true), 800)
    return () => clearTimeout(timer)
  }, [roomKey])

  return (id: string) => Date.now() - (s.arrived.get(id) ?? 0) < ENTER_MS
}

interface BubbleProps {
  message: Message
  first: boolean
  last: boolean
  enter: boolean
  status: Delivery | null
  showStatus: boolean
  readers: string[]
  group: boolean
}

function Bubble({ message, first, last, enter, status, showStatus, readers, group }: BubbleProps) {
  // "Seen" is stronger than "Delivered": the person, not just their Mac, has it.
  const shown = status === 'synced' && readers.length ? 'seen' : status
  const info = shown === 'seen' ? seenLabel(readers) : shown ? delivery[shown] : null
  // Only my latest message says where it stands (earlier pending ones are just
  // paler), unless one failed.
  const labelled = info && (showStatus || shown === 'failed')
  const classes = [
    'message',
    message.mine && 'mine',
    first && 'first',
    last && 'last',
    shown,
    enter && 'enter'
  ]

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {first && !message.mine && (
        <p className={'author' + (group ? ' indented' : '')}>{message.name}</p>
      )}
      <div className='bubble-row'>
        {/* In a group, who said it sits next to their last bubble, as in Messages. */}
        {group && !message.mine && (
          <span className='bubble-avatar'>
            {last && <Avatar seed={message.writer} size='small' />}
          </span>
        )}
        <p className='bubble' title={full.format(message.at)}>
          {message.text}
        </p>
      </div>
      {labelled && (
        <p key={info.label} className={'delivery ' + shown} title={info.title}>
          {info.icon && <Icon name={info.icon} size={13} />}
          {info.label}
        </p>
      )}
    </div>
  )
}

// "Today 9:41 PM", "Yesterday 9:41 PM", "Monday 9:41 PM", "Wed, 16 Sep at 9:41 PM"
function TimeHeading({ at }: { at: number }) {
  const old = Date.now() - at >= 6 * DAY
  return (
    <p className='time-heading'>
      <strong>{dayName(at)}</strong> {old ? 'at ' : ''}
      {time.format(at)}
    </p>
  )
}

function dayName(at: number): string {
  if (sameDay(at, Date.now())) return 'Today'
  if (sameDay(at, Date.now() - DAY)) return 'Yesterday'
  if (Date.now() - at < 6 * DAY) return weekday.format(at)
  return date.format(at)
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function sameAuthor(a: Item | undefined, b: Item | undefined): boolean {
  if (!a || !b || a.kind === 'notice' || b.kind === 'notice') return false
  return a.mine === b.mine && a.writer === b.writer && a.name === b.name
}

function seenLabel(names: string[]): Label {
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  return { label: 'Seen by ' + who, title: `${names.join(', ')} read this on their device.` }
}

// Three dots in a bubble while someone is writing. Never stored anywhere.
function Typing({ names }: { names: string[] }) {
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
