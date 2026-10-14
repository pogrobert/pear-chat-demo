import {
  ArrowUpIcon,
  CaretRightIcon,
  ChatsCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  GearSixIcon,
  InfoIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SmileyIcon,
  TrashIcon,
  UserIcon,
  WarningCircleIcon,
  type IconWeight
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
  key: KeyIcon,
  gear: GearSixIcon,
  user: UserIcon
}

export type IconName = keyof typeof icons

interface Props {
  name: IconName
  size?: number
  weight?: IconWeight
}

export default function Icon({ name, size = 18, weight = 'regular' }: Props) {
  const Component = icons[name]
  return <Component className='icon' size={size} weight={weight} aria-hidden='true' />
}
