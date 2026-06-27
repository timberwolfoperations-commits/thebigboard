import type { BracketMatch, BracketUserPick, Team } from '@/lib/types'

interface MatchNodeProps {
  match: BracketMatch
  userPick?: BracketUserPick
  isLocked: boolean
  teamsById?: Record<string, Team>
  onPick?: (matchId: string, teamId: string) => void
}

function MatchNode({ match, userPick, isLocked, teamsById, onPick }: MatchNodeProps) {
  const homePickDisabled = isLocked || match.status === 'completed' || !match.home_team_id
  const awayPickDisabled = isLocked || match.status === 'completed' || !match.away_team_id
  const pickedHome = userPick?.choice_team_id === match.home_team_id
  const pickedAway = userPick?.choice_team_id === match.away_team_id
  const homeTeam = match.home_team_id ? teamsById?.[match.home_team_id] : undefined
  const awayTeam = match.away_team_id ? teamsById?.[match.away_team_id] : undefined
  const homeLabel = homeTeam
    ? `${homeTeam.flag_emoji} ${homeTeam.country_name}`
    : match.home_placeholder || 'TBD'
  const awayLabel = awayTeam
    ? `${awayTeam.flag_emoji} ${awayTeam.country_name}`
    : match.away_placeholder || 'TBD'
  const kickoffLabel = match.kickoff_time
    ? new Date(match.kickoff_time).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  const statusColors: Record<string, string> = {
    live: 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40',
    completed: 'bg-zinc-700/40 text-zinc-400',
    scheduled: 'bg-zinc-800/60 text-zinc-500',
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden w-52">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
          {match.round_name}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${statusColors[match.status]}`}
        >
          {match.status}
        </span>
      </div>

      {/* Home team */}
      <button
        disabled={homePickDisabled}
        onClick={() =>
          !isLocked && match.home_team_id && onPick?.(match.id, match.home_team_id)
        }
        className={`w-full flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/60 text-left transition-colors
          ${pickedHome ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800/60'}
          ${homePickDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
        `}
      >
        <span className="text-sm font-medium truncate">
          {homeLabel}
        </span>
        {match.status === 'completed' && (
          <span className="text-sm font-bold text-zinc-300 ml-2">{match.home_score}</span>
        )}
        {pickedHome && (
          <span className="ml-2 text-amber-400 text-xs">✓</span>
        )}
      </button>

      {/* Away team */}
      <button
        disabled={awayPickDisabled}
        onClick={() =>
          !isLocked && match.away_team_id && onPick?.(match.id, match.away_team_id)
        }
        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors
          ${pickedAway ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800/60'}
          ${awayPickDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
        `}
      >
        <span className="text-sm font-medium truncate">
          {awayLabel}
        </span>
        {match.status === 'completed' && (
          <span className="text-sm font-bold text-zinc-300 ml-2">{match.away_score}</span>
        )}
        {pickedAway && (
          <span className="ml-2 text-amber-400 text-xs">✓</span>
        )}
      </button>

      {/* Venue */}
      {(match.venue || kickoffLabel) && (
        <div className="px-3 py-1 bg-zinc-950/40 flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-600 truncate">{match.venue ?? 'Venue TBD'}</span>
          {kickoffLabel && (
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">{kickoffLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

interface RoundGroup {
  roundName: string
  matches: BracketMatch[]
}

interface BracketTreeProps {
  matches: BracketMatch[]
  picks: BracketUserPick[]
  isLocked: boolean
  teamsById?: Record<string, Team>
  onPick?: (matchId: string, teamId: string) => void
}

export default function BracketTree({ matches, picks, isLocked, teamsById, onPick }: BracketTreeProps) {
  const picksMap = new Map(picks.map((p) => [p.match_id, p]))

  // Group matches by round, preserving natural order
  const rounds: RoundGroup[] = []
  const seen = new Set<string>()
  for (const match of matches) {
    if (!seen.has(match.round_name)) {
      seen.add(match.round_name)
      rounds.push({ roundName: match.round_name, matches: [] })
    }
    rounds[rounds.length - 1].matches.push(match)
  }

  if (rounds.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-sm">No matches scheduled yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-6">
      <div className="flex gap-8 min-w-max px-4">
        {rounds.map((round) => (
          <div key={round.roundName} className="flex flex-col gap-4">
            <div className="text-center">
              <span className="text-xs uppercase tracking-widest font-semibold text-zinc-500">
                {round.roundName}
              </span>
            </div>
            <div className="flex flex-col gap-4 justify-around flex-1">
              {round.matches.map((match) => (
                <MatchNode
                  key={match.id}
                  match={match}
                  userPick={picksMap.get(match.id)}
                  isLocked={isLocked}
                  teamsById={teamsById}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
