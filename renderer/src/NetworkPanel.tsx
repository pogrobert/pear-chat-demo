import { useEffect, useRef, useState } from 'react'
import Icon from './icons.tsx'
import Avatar from './Avatar.tsx'
import { useChat } from './state/chat.ts'
import type { NetworkLog, NetworkPeer, NetworkSnapshot } from './types.ts'

const HISTORY = 40 // seconds of throughput kept for each peer's sparkline

// What the P2P layer is doing right now, once a second: where this Mac sits on
// the DHT, who it is connected to and how, and how each signed log in the room
// is replicating. Everything here is read from Hyperswarm, HyperDHT, UDX and
// Hypercore in the worker; nothing passes through a server.
export default function NetworkPanel({ onClose }: { onClose(): void }) {
  const network = useChat((s) => s.network)
  const watch = useChat((s) => s.watchNetwork)
  const rates = useThroughput(network)
  // IP addresses are hidden until asked for, so screenshots and screen
  // recordings of the panel don't leak where you or your peers are.
  const [reveal, setReveal] = useState(false)
  const address = (host: string | null, port: number | null) =>
    host ? `${reveal || isLocal(host) ? host : mask(host)}:${port}` : ''

  useEffect(() => {
    watch(true)
    return () => watch(false)
  }, [watch])

  return (
    <aside className='inspector' aria-label='Network'>
      <header className='inspector-top drag'>
        <h1>Network</h1>
        <button className='tool' onClick={onClose} aria-label='Close network panel' title='Close'>
          <Icon name='close' />
        </button>
      </header>

      {!network ? (
        <p className='inspector-empty'>Reading the network…</p>
      ) : (
        <div className='inspector-scroll'>
          <ThisMac
            network={network}
            address={address}
            reveal={reveal}
            onReveal={() => setReveal((on) => !on)}
          />
          {network.room ? (
            <>
              <Peers peers={network.room.peers} rates={rates} address={address} />
              <Logs logs={network.room.logs} />
            </>
          ) : (
            <p className='inspector-empty'>Open a room to see its peers and logs.</p>
          )}
        </div>
      )}
    </aside>
  )
}

type Address = (host: string | null, port: number | null) => string

interface ThisMacProps {
  network: NetworkSnapshot
  address: Address
  reveal: boolean
  onReveal(): void
}

function ThisMac({ network, address, reveal, onReveal }: ThisMacProps) {
  const { dht, room } = network
  const reach = dht.randomized
    ? { tone: 'warn', label: 'Strict NAT', hint: 'Hole punching may fail on this network.' }
    : dht.firewalled
      ? { tone: 'on', label: 'Behind a firewall', hint: 'Peers reach you by hole punching.' }
      : { tone: 'on', label: 'Reachable', hint: 'Peers can connect to you directly.' }

  return (
    <section>
      <h2>This Mac</h2>
      <dl className='facts'>
        <dt>DHT</dt>
        <dd>
          <span className={'dot ' + reach.tone} /> {reach.label}
          <small>{reach.hint}</small>
        </dd>
        {dht.host && (
          <>
            <dt>Public address</dt>
            <dd>
              <span className='mono'>{address(dht.host, dht.port)}</span>{' '}
              <button className='link-button' onClick={onReveal}>
                {reveal ? 'Hide' : 'Show'}
              </button>
            </dd>
          </>
        )}
        {room && (
          <>
            <dt>Room topic</dt>
            <dd>
              <span className='mono'>{short(room.topic)}</span>{' '}
              {room.announced ? '· announced' : '· announcing…'}
              <small>A hash of the room key, so the DHT never sees the key.</small>
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}

interface PeersProps {
  peers: NetworkPeer[]
  rates: Map<string, number[]>
  address: Address
}

function Peers({ peers, rates, address }: PeersProps) {
  return (
    <section>
      <h2>
        Peers <span className='count'>{peers.length}</span>
      </h2>
      {peers.length === 0 ? (
        <p className='hint'>
          No one is connected. Peers appear here the moment a connection opens.
        </p>
      ) : (
        <ul className='net-list'>
          {peers.map((peer) => (
            <li key={peer.id} className='net-peer'>
              <Avatar seed={peer.id} size='medium' online />
              <div className='grow-block'>
                <div className='net-line'>
                  <b>{peer.name}</b>
                  {peer.rtt !== null && <span className='mono'>{peer.rtt} ms</span>}
                </div>
                <p className='net-sub'>
                  {path(peer.host)} · {peer.dialed ? 'you connected' : 'they connected'}
                </p>
                {peer.host && <p className='net-sub mono'>{address(peer.host, peer.port)}</p>}
                <div className='net-line net-sub'>
                  <span>
                    ↑ {bytes(peer.sent)} · ↓ {bytes(peer.received)} ·{' '}
                    {duration(Date.now() - peer.since)}
                  </span>
                  <Sparkline values={rates.get(peer.id) ?? []} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Logs({ logs }: { logs: NetworkLog[] }) {
  return (
    <section>
      <h2>
        Logs <span className='count'>{logs.length}</span>
      </h2>
      <p className='hint'>
        Everyone writes to their own signed log. Peers copy each other’s; nobody can change someone
        else’s.
      </p>
      <ul className='net-list'>
        {logs.map((log) => {
          const behind = !log.mine && log.held < log.target
          return (
            <li key={log.id} className='net-log'>
              <Avatar seed={log.id} size='medium' />
              <div className='grow-block'>
                <div className='net-line'>
                  <b>{log.mine ? 'You' : (log.name ?? 'Someone')}</b>
                  <span className='mono net-key' title={log.id}>
                    {short(log.id)}
                  </span>
                </div>
                <p className='net-sub'>{describe(log)}</p>
                {behind && (
                  <progress
                    value={log.held}
                    max={log.target}
                    aria-label={`Downloading ${log.name}’s log`}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function describe(log: NetworkLog): string {
  const n = (count: number) => `${count} ${count === 1 ? 'message' : 'messages'}`
  if (log.mine) {
    const waiting = log.length - (log.synced ?? 0)
    const status =
      log.length === 0
        ? ''
        : waiting > 0
          ? ` · ${waiting} not with a peer yet`
          : ' · all with a peer'
    return `${n(log.length)}${status} · ↑ ${bytes(log.uploaded)}`
  }
  if (log.held < log.target) {
    return `Catching up: ${log.held} of ${n(log.target)} · ↓ ${bytes(log.downloaded)}`
  }
  return `${n(log.held)} on this Mac · ↓ ${bytes(log.downloaded)}`
}

// Bytes per second over the last few seconds, worked out from the running
// totals in consecutive snapshots.
function useThroughput(network: NetworkSnapshot | null) {
  const last = useRef(new Map<string, { total: number; at: number }>())
  const history = useRef(new Map<string, number[]>())
  const seen = useRef<number | null>(null)

  if (network && network.at !== seen.current) {
    seen.current = network.at
    for (const peer of network.room?.peers ?? []) {
      const total = peer.sent + peer.received
      const previous = last.current.get(peer.id)
      const rate = previous
        ? Math.max(0, (total - previous.total) / ((network.at - previous.at) / 1000))
        : 0
      last.current.set(peer.id, { total, at: network.at })
      history.current.set(peer.id, [...(history.current.get(peer.id) ?? []), rate].slice(-HISTORY))
    }
  }
  return history.current
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const width = 64
  const height = 16
  const step = width / (HISTORY - 1)
  const offset = width - (values.length - 1) * step
  const points = values
    .map(
      (value, i) =>
        `${(offset + i * step).toFixed(1)},${(height - 1 - (value / max) * (height - 2)).toFixed(1)}`
    )
    .join(' ')
  return (
    <svg className='sparkline' width={width} height={height} aria-hidden='true'>
      <polyline points={points} />
    </svg>
  )
}

// On the same network if the address is private; otherwise a direct
// connection across the internet (UDP hole punching when needed). This app
// never routes through relays.
function path(host: string | null): string {
  if (!host) return 'Direct'
  return isLocal(host) ? 'Same network' : 'Internet, direct'
}

function isLocal(host: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80:|f[cd])/i.test(host)
}

// 203.0.113.7 → 203.•••.•••.•••
function mask(host: string): string {
  if (host.includes(':')) return host.split(':')[0] + ':••••'
  const [first] = host.split('.')
  return `${first}.•••.•••.•••`
}

function short(key: string): string {
  return key.slice(0, 6) + '…' + key.slice(-4)
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
