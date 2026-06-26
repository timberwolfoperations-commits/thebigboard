interface ScoreEntry {
  userId: string
  displayName: string
  correctPicks: number
  totalPicks: number
  hasPaid: boolean
}

interface ScoreboardProps {
  entries: ScoreEntry[]
  currentUserId: string
}

export default function Scoreboard({ entries, currentUserId }: ScoreboardProps) {
  const sorted = [...entries].sort((a, b) => b.correctPicks - a.correctPicks)

  return (
    <div className="mt-6">
      <div className="px-4 mb-3">
        <h2 className="text-xs uppercase tracking-widest font-semibold text-zinc-500">
          Standings
        </h2>
      </div>

      <div className="flex flex-col divide-y divide-zinc-800/60">
        {sorted.map((entry, index) => {
          const isCurrentUser = entry.userId === currentUserId
          const pct =
            entry.totalPicks > 0
              ? Math.round((entry.correctPicks / entry.totalPicks) * 100)
              : 0

          return (
            <div
              key={entry.userId}
              className={`flex items-center px-4 py-3 gap-4 ${
                isCurrentUser ? 'bg-amber-500/8' : ''
              }`}
            >
              {/* Rank */}
              <div className="w-6 text-center">
                <span
                  className={`text-sm font-bold ${
                    index === 0
                      ? 'text-amber-400'
                      : index === 1
                      ? 'text-zinc-300'
                      : index === 2
                      ? 'text-amber-700'
                      : 'text-zinc-600'
                  }`}
                >
                  {index + 1}
                </span>
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm font-medium truncate ${
                    isCurrentUser ? 'text-amber-300' : 'text-zinc-200'
                  }`}
                >
                  {entry.displayName}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-[10px] text-amber-500/70 font-normal">
                      (you)
                    </span>
                  )}
                </span>
              </div>

              {/* Payment badge */}
              <div>
                {entry.hasPaid ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 font-semibold uppercase tracking-wide">
                    Paid
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold uppercase tracking-wide">
                    Unpaid
                  </span>
                )}
              </div>

              {/* Score */}
              <div className="text-right min-w-[3.5rem]">
                <span className="text-sm font-bold text-zinc-100">
                  {entry.correctPicks}
                  <span className="text-zinc-600 font-normal text-xs">
                    /{entry.totalPicks}
                  </span>
                </span>
                <div className="text-[10px] text-zinc-500">{pct}%</div>
              </div>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-600 text-sm">
            No entries yet.
          </div>
        )}
      </div>
    </div>
  )
}
