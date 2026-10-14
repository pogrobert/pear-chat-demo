import { useEffect, useState } from 'react'
import { statusOf } from './useChat.js'
import Timeline from './Timeline.jsx'
import Composer from './Composer.jsx'
import Icon from './icons.jsx'

export default function Conversation({ state, online, onSend, onCopyKey }) {
  const { status, peers, items, syncedLength, catchup, created, key } = state
  const waiting = items.filter((item) => statusOf(item, syncedLength) === 'pending').length

  return (
    <>
      <Catchup catchup={catchup} />
      <Timeline
        items={items}
        syncedLength={syncedLength}
        empty={
          <EmptyRoom
            status={status}
            peers={peers}
            created={created}
            online={online}
            onCopyKey={onCopyKey}
          />
        }
      />
      {waiting > 0 && status !== 'connected' && (
        <p className='waiting' role='status'>
          {waiting === 1 ? '1 message' : `${waiting} messages`} will be delivered when a peer is
          here.
        </p>
      )}
      <Composer onSend={onSend} roomKey={key} />
    </>
  )
}

// Shown while missed messages download, then briefly once they are in.
function Catchup({ catchup }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!catchup) return
    setVisible(true)
    if (catchup.remaining > 0) return
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [catchup])

  if (!catchup || !visible) return null
  const { remaining, total } = catchup
  const noun = total === 1 ? 'message' : 'messages'

  return (
    <div className='catchup' role='status'>
      {remaining > 0 ? (
        <>
          <span>
            Catching up… {total - remaining} of {total} {noun}
          </span>
          <progress value={total - remaining} max={total} aria-label='Catching up' />
        </>
      ) : (
        <span>
          <Icon name='check' size={12} /> Up to date. {total} {noun} synced from peers.
        </span>
      )}
    </div>
  )
}

function EmptyRoom({ status, peers, created, online, onCopyKey }) {
  if (!online) {
    return (
      <Empty title='You’re Offline'>
        You can still write. Messages are saved on this Mac and delivered when you’re back online
        and a peer is here.
      </Empty>
    )
  }
  if (status === 'connected') {
    const who =
      peers.length === 1 ? `${peers[0].name} is here.` : `${peers.length} people are here.`
    return (
      <Empty title='Say Hello'>
        {who} Messages go straight to them, with no server in between.
      </Empty>
    )
  }
  if (status === 'alone') {
    return created ? (
      <Empty title='Your Room Is Ready' action={<button onClick={onCopyKey}>Copy Room Key</button>}>
        Send the room key to someone to start chatting. The room exists only on the devices in it,
        so it’s reachable while one of you has it open.
      </Empty>
    ) : (
      <Empty title='No One Else Is Here'>
        Messages you write now are saved on this Mac and delivered when a peer comes online. If you
        expected someone, check that the key is right.
      </Empty>
    )
  }
  return (
    <Empty title='Looking for Peers…' busy>
      Announcing this room and searching for others in it. This usually takes a few seconds.
    </Empty>
  )
}

export function Empty({ title, busy, action, children }) {
  return (
    <div className='empty'>
      {busy ? <span className='spinner' aria-hidden='true' /> : <Icon name='bubbles' size={40} />}
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}
