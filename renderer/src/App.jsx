import { useEffect, useState } from 'react'
import { useChat } from './useChat.js'
import { load, save } from './storage.js'
import Welcome from './Welcome.jsx'
import Lobby from './Lobby.jsx'
import Room from './Room.jsx'

export default function App() {
  const [name, setName] = useState(() => load('name') || '')
  const chat = useChat(name)
  const online = useOnline()
  const { state } = chat

  function changeName(next) {
    save('name', next)
    setName(next)
    if (state.phase === 'room') chat.rename(next)
  }

  if (!name) return <Welcome onSubmit={changeName} />

  if (state.phase === 'crashed') {
    return (
      <main className='center'>
        <div className='card' role='alert'>
          <h1>Something stopped working</h1>
          <p>
            The background process that handles peer connections has stopped. Your messages are safe
            on this device.
          </p>
          <button className='primary' onClick={chat.restart} autoFocus>
            Restart
          </button>
        </div>
      </main>
    )
  }

  if (state.phase === 'room') {
    return (
      <Room
        state={state}
        name={name}
        online={online}
        onSend={chat.send}
        onLeave={chat.leave}
        onRename={changeName}
      />
    )
  }

  return (
    <Lobby
      name={name}
      busy={state.phase === 'joining'}
      error={state.joinError}
      onCreate={() => chat.join(null)}
      onJoin={chat.join}
    />
  )
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
