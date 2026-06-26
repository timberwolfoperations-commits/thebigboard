import Link from 'next/link'

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60">
      <div className="relative flex items-center justify-between h-14 px-4 max-w-screen-sm mx-auto">
        {/* Far Left – Hamburger */}
        <button
          aria-label="Open menu"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Center – App Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap select-none pointer-events-none"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          The Big Board
        </h1>

        {/* Far Right – Create Pool */}
        <Link
          href="/dashboard/create-group"
          aria-label="Create new pool"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </Link>
      </div>
    </header>
  )
}
