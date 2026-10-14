import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudSlashIcon, KeyIcon, LaptopIcon, UserIcon } from '@phosphor-icons/react'
import { Avatar, huesFor } from './Sidebar.jsx'
import './onboarding.css'

// First run: four cards over the (blurred) app. The first three explain the
// three ideas that make this app different, each with a small animation that
// shows the idea instead of describing it. The last one asks for a name and
// ends in an action: create a room or join one.
const steps = [
  {
    title: 'Nothing in the middle',
    body: 'Pear Chat sends messages straight from your Mac to theirs. No server, no account, nothing to sign up for.',
    Art: DirectArt
  },
  {
    title: 'A room is just a key',
    body: 'Create a room and you get a key. Anyone you share it with can join, however you send it.',
    Art: KeyArt
  },
  {
    title: 'Offline is fine',
    body: 'Write any time. Messages wait on your Mac and sync the moment someone from the room is back.',
    Art: OfflineArt
  },
  {
    title: 'What should people call you?',
    body: 'Your name is stored on this Mac and shown next to your messages.',
    Art: NameArt
  }
]
const LAST = steps.length - 1

export default function Onboarding({ initialName = '', onDone }) {
  const [step, setStep] = useState(0)
  const [previous, setPrevious] = useState(null)
  const [direction, setDirection] = useState(1)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const primary = useRef(null)
  const input = useRef(null)

  function go(next) {
    if (next === step || next < 0 || next > LAST) return
    setDirection(next > step ? 1 : -1)
    setPrevious(step)
    setStep(next)
  }

  // The outgoing card stays just long enough to animate out.
  useEffect(() => {
    if (previous === null) return
    const timer = setTimeout(() => setPrevious(null), 280)
    return () => clearTimeout(timer)
  }, [previous])

  // Keep focus where the next action is.
  useEffect(() => {
    if (step === LAST) input.current?.focus()
    else primary.current?.focus()
  }, [step])

  // Arrow keys page through the cards, except while typing.
  useEffect(() => {
    function onKey(event) {
      if (event.target.tagName === 'INPUT') return
      if (event.key === 'ArrowRight') go(step + 1)
      if (event.key === 'ArrowLeft') go(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function finish(action) {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(true)
      input.current.focus()
      return
    }
    setLeaving(true)
    setTimeout(() => onDone(trimmed, action), 300)
  }

  const nameField = (
    <div className='ob-field'>
      <input
        ref={input}
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          setError(false)
        }}
        onKeyDown={(event) => event.key === 'Enter' && finish('create')}
        placeholder='Your name'
        maxLength={40}
        autoComplete='off'
        spellCheck={false}
        aria-label='Your name'
        aria-invalid={error}
        aria-describedby={error ? 'ob-error' : undefined}
      />
      {error && (
        <p id='ob-error' className='error' role='alert'>
          Enter a name to continue.
        </p>
      )}
    </div>
  )

  return (
    <div className='onboarding' data-state={leaving ? 'closing' : 'open'}>
      <div className='ob-drag drag' />
      <div className='ob-card' role='dialog' aria-modal='true' aria-labelledby='ob-title'>
        <div className='ob-aurora' data-step={step} aria-hidden='true'>
          <i />
          <i />
          <i />
        </div>

        {step < LAST && (
          <button className='ob-skip' onClick={() => go(LAST)}>
            Skip
          </button>
        )}

        <div className='ob-steps'>
          {previous !== null && (
            <Step
              key={'out-' + previous}
              index={previous}
              state='exit'
              direction={direction}
              name={name}
            />
          )}
          <Step key={step} index={step} state='enter' direction={direction} name={name}>
            {step === LAST && nameField}
          </Step>
        </div>

        <div className='ob-foot'>
          <div className='ob-actions' key={step === LAST ? 'last' : 'next'}>
            {step < LAST ? (
              <button ref={primary} className='default' onClick={() => go(step + 1)}>
                Continue
              </button>
            ) : (
              <>
                <button className='default' onClick={() => finish('create')}>
                  Create Room
                </button>
                <button onClick={() => finish('join')}>Join with Key…</button>
              </>
            )}
          </div>
          <div className='ob-dots' role='group' aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, index) => (
              <button
                key={index}
                className='ob-dot'
                onClick={() => go(index)}
                aria-label={`Step ${index + 1}`}
                aria-current={index === step ? 'step' : undefined}
              />
            ))}
            <span className='ob-dot-active' style={{ '--step': step }} aria-hidden='true' />
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ index, state, direction, name, children }) {
  const { title, body, Art } = steps[index]
  const live = state === 'enter'
  return (
    <section
      className='ob-step'
      data-state={state}
      style={{ '--dir': direction }}
      aria-hidden={!live}
    >
      <div className='ob-art' style={{ '--i': 0 }}>
        <Art name={name} />
      </div>
      <div className='ob-copy'>
        <h1 id={live ? 'ob-title' : undefined} style={{ '--i': 1 }}>
          {title}
        </h1>
        <p style={{ '--i': 2 }}>{body}</p>
        {children && <div style={{ '--i': 3 }}>{children}</div>}
      </div>
    </section>
  )
}

// 1. Two Macs; a server appears between them, is struck out, and a direct
//    line draws itself with a message travelling along it.
function DirectArt() {
  return (
    <div className='art-direct'>
      <div className='ob-tile mac from-left'>
        <LaptopIcon size={46} weight='duotone' />
      </div>
      <div className='wire'>
        <span className='wire-server'>
          <CloudSlashIcon size={22} />
        </span>
        <span className='wire-line' />
        <span className='wire-packet' />
      </div>
      <div className='ob-tile mac from-right'>
        <LaptopIcon size={46} weight='duotone' />
      </div>
    </div>
  )
}

// 2. A key that types itself out, then the people who used it arrive.
const Z32 = 'ybndrfg8ejkmcpqxot1uwisza345h769'

function KeyArt() {
  const key = useMemo(
    () => Array.from({ length: 16 }, () => Z32[Math.floor(Math.random() * 32)]).join(''),
    []
  )
  const text = useScramble(key)
  return (
    <div className='art-key'>
      <div className='ob-tile keycap'>
        <KeyIcon size={20} weight='duotone' />
        <span className='mono'>{text.match(/.{1,4}/g).join(' ')} …</span>
        <span className='shine' />
      </div>
      <div className='joiners'>
        {['Alice', 'Joe', 'Mia'].map((person, index) => (
          <span key={person} className='joiner' style={{ '--j': index }}>
            <Avatar names={[person]} size='small' />
            {person} joined
          </span>
        ))}
      </div>
    </div>
  )
}

// Characters settle left to right over about a second.
function useScramble(target) {
  const reduce = usePrefersReducedMotion()
  const [text, setText] = useState(reduce ? target : scramble(target, 0))
  useEffect(() => {
    if (reduce) return setText(target)
    let frame = 0
    const timer = setInterval(() => {
      frame++
      const settled = Math.max(0, Math.floor((frame - 6) / 1.4))
      setText(scramble(target, settled))
      if (settled >= target.length) clearInterval(timer)
    }, 40)
    return () => clearInterval(timer)
  }, [target, reduce])
  return text
}

function scramble(target, settled) {
  return [...target]
    .map((char, i) => (i < settled ? char : Z32[Math.floor(Math.random() * 32)]))
    .join('')
}

// 3. A message waits while the peer is away, then is delivered when they return.
function OfflineArt() {
  const [back, setBack] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setBack(true), 1600)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className='ob-tile art-offline'>
      <div className='chat-head'>
        <span className={'dot' + (back ? ' on' : '')} />
        <span key={back}>{back ? 'Mia is back online' : 'Mia is offline'}</span>
      </div>
      <p className='chat-bubble theirs'>Talk tomorrow?</p>
      <p className={'chat-bubble mine' + (back ? '' : ' pending')}>
        Writing this while you’re away
      </p>
      <p className='chat-status' key={'s' + back}>
        {back ? 'Delivered' : 'Waiting for a peer'}
      </p>
    </div>
  )
}

// 4. Your avatar, taking shape as you type.
function NameArt({ name }) {
  const trimmed = name.trim()
  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const [top, bottom] = trimmed ? huesFor(trimmed) : ['#b9bdc7', '#8d929c']
  return (
    <div className='art-name'>
      <div className='ob-avatar' style={{ '--top': top, '--bottom': bottom }}>
        {initials ? (
          <span key={initials} className='ob-initials'>
            {initials}
          </span>
        ) : (
          <UserIcon size={44} weight='fill' />
        )}
      </div>
      <p className='ob-avatar-name'>{trimmed || 'You'}</p>
    </div>
  )
}

function usePrefersReducedMotion() {
  return useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
}
