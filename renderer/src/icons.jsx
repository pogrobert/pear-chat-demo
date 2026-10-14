// A few line icons drawn to sit next to SF Pro text (16pt grid, 1.5 stroke).
const paths = {
  plus: 'M8 3v10M3 8h10',
  sidebar: 'M2.5 3.5h11v9h-11zM6 3.5v9',
  copy: 'M5.5 5.5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M3.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
  check: 'm3.5 8.5 3 3 6-7',
  send: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  clock: 'M8 4.5V8l2.2 1.4M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z',
  alert: 'M8 4.5v4M8 11v.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z',
  bubbles:
    'M2.5 4.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6l-2.5 2v-2a1 1 0 0 1-1-1ZM11.5 6h0a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1v2L10 12H8a2 2 0 0 1-1.7-1',
  key: 'M10 2.5a3.5 3.5 0 1 1-2.9 5.5L2.5 12.6v1h2v-1.5H6v-1.5h1.5l.6-.6M10.5 5h0'
}

export default function Icon({ name, size = 16 }) {
  return (
    <svg className='icon' viewBox='0 0 16 16' width={size} height={size} aria-hidden='true'>
      <path d={paths[name]} />
    </svg>
  )
}
