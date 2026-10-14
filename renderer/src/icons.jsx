// A few line icons drawn to sit next to SF Pro text (16pt grid, 1.5 stroke).
const paths = {
  plus: 'M8 3v10M3 8h10',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM10.6 10.6 14 14',
  compose: 'M13.5 8.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4M11.8 2.2l2 2L8 10H6V8Z',
  chevron: 'm6 4 4 4-4 4',
  smile:
    'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0ZM5.5 9.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6.2v.3M10 6.2v.3',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
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
