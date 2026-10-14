import {
  ArrowUpIcon,
  CaretRightIcon,
  ChatsCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  InfoIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SmileyIcon,
  TrashIcon,
  WarningCircleIcon
} from '@phosphor-icons/react'

// Phosphor icons, imported one by one so the bundle only carries these.
const icons = {
  plus: PlusIcon,
  search: MagnifyingGlassIcon,
  compose: NotePencilIcon,
  chevron: CaretRightIcon,
  smile: SmileyIcon,
  trash: TrashIcon,
  info: InfoIcon,
  sidebar: SidebarSimpleIcon,
  copy: CopyIcon,
  check: CheckIcon,
  send: ArrowUpIcon,
  clock: ClockIcon,
  alert: WarningCircleIcon,
  bubbles: ChatsCircleIcon,
  key: KeyIcon
}

export default function Icon({ name, size = 18, weight = 'regular' }) {
  const Component = icons[name]
  return <Component className='icon' size={size} weight={weight} aria-hidden='true' />
}
