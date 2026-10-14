import BoringAvatar from 'boring-avatars'
import Icon from './icons.tsx'
import type { SavedRoom } from './types.ts'

// Avatars are drawn from a key, not a name. A person's key is their signed
// log in the room, so two people called "Alice" still look different, and no
// one can take on someone else's avatar by copying their name.
const palette = ['#0a84ff', '#5e5ce6', '#30d158', '#ff9f0a', '#ff6482']
const sizes = { large: 44, me: 34, medium: 28, small: 22 }

interface Props {
  seed: string | null | undefined // a writer key, or a room key for rooms
  size?: keyof typeof sizes
  online?: boolean
}

export default function Avatar({ seed, size = 'large', online }: Props) {
  const px = sizes[size]
  return (
    <span className={'avatar ' + size} aria-hidden='true'>
      {seed ? (
        <BoringAvatar name={seed} variant='marble' size={px} colors={palette} />
      ) : (
        <Icon name='user' size={Math.round(px * 0.55)} weight='fill' />
      )}
      {online && <span className='online' />}
    </span>
  )
}

// A room looks like the people in it, as conversations do in Messages: one
// other person shows their avatar, a group shows two of its members, and a
// room no one else has joined yet shows a marble from the room key.
export function RoomAvatar({ room, online }: { room: SavedRoom; online?: boolean }) {
  const members = room.members ?? []
  if (members.length < 2) {
    return <Avatar seed={members[0]?.key ?? room.key} size='medium' online={online} />
  }
  return (
    <span className='avatar-pair' aria-hidden='true'>
      <Avatar seed={members[0].key} size='small' />
      <Avatar seed={members[1].key} size='small' />
      {online && <span className='online' />}
    </span>
  )
}
