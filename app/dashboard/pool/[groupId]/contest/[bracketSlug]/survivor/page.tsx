'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NFL_TEAMS, NFL_TEAMS_BY_ABBR } from '@/lib/nflTeams'
import type { SurvivorPick, SurvivorGameState } from '@/lib/types'

interface ParticipantRow {
  userId: string
  displayName: string
  isEliminated: boolean
  currentPick: string | null
  currentPickResult: 'pending' | 'win' | 'loss' | null
}

export default function SurvivorPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.groupId as string
  const gameSlug = params.bracketSlug as string

  const [userId, setUserId] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameDisplayName, setGameDisplayName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const [myPicks, setMyPicks] = useState<SurvivorPick[]>([])
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pick' | 'scoreboard'>('pick')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }
    setUserId(user.id)

    // Resolve game
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: gameData } = await (supabase as any)
      .from('games')
      .select('id, display_name')
      .eq('slug', gameSlug)
      .maybeSingle()

    if (!gameData) {
      setError('Game not found.')
      setLoading(false)
      return
    }

    setGameId(gameData.id as string)
    setGameDisplayName(gameData.display_name as string)

    // Group name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: groupData } = await (supabase as any)
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle()
    if (groupData) setGroupName(groupData.name as string)

    // Current week state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stateData } = await (supabase as any)
      .from('survivor_game_state')
      .select('current_week')
      .eq('game_id', gameData.id)
      .eq('group_id', groupId)
      .maybeSingle()

    const week = (stateData as SurvivorGameState | null)?.current_week ?? 1
    setCurrentWeek(week)

    // My picks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: myPickData } = await (supabase as any)
      .from('survivor_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('game_id', gameData.id)
      .eq('group_id', groupId)

    setMyPicks((myPickData ?? []) as SurvivorPick[])

    // All picks for scoreboard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allPicksData } = await (supabase as any)
      .from('survivor_picks')
      .select('*')
      .eq('game_id', gameData.id)
      .eq('group_id', groupId)

    const allPicks = (allPicksData ?? []) as SurvivorPick[]

    // Members
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberData } = await (supabase as any)
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', groupId)

    const members = (memberData ?? []) as { user_id: string }[]

    const participantList: ParticipantRow[] = members.map((m) => {
      const userPicks = allPicks.filter((p) => p.user_id === m.user_id)
      const isEliminated = userPicks.some((p) => p.result === 'loss')
      const weekPick = userPicks.find((p) => p.week === week)
      const isCurrentUser = m.user_id === user.id
      return {
        userId: m.user_id,
        displayName: isCurrentUser
          ? 'You'
          : `Player ${m.user_id.slice(0, 6)}`,
        isEliminated,
        currentPick: weekPick?.team ?? null,
        currentPickResult: weekPick?.result ?? null,
      }
    })

    // Sort: alive first, then eliminated; current user always first within group
    participantList.sort((a, b) => {
      if (a.userId === user.id) return -1
      if (b.userId === user.id) return 1
      if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1
      return a.displayName.localeCompare(b.displayName)
    })

    setParticipants(participantList)
    setLoading(false)
  }, [groupId, gameSlug, router])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  const usedTeams = new Set(myPicks.map((p) => p.team))
  const thisWeekPick = myPicks.find((p) => p.week === currentWeek)
  const isEliminated = myPicks.some((p) => p.result === 'loss')
  const isLocked = thisWeekPick?.result !== 'pending' && thisWeekPick != null

  async function handlePick(team: string) {
    if (!userId || !gameId) return
    if (isEliminated) return
    if (isLocked) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    if (thisWeekPick) {
      // Update existing pick
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from('survivor_picks')
        .update({ team })
        .eq('id', thisWeekPick.id)
        .eq('user_id', userId)
      if (updateErr) {
        setError('Failed to update pick. Try again.')
        setSaving(false)
        return
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase as any)
        .from('survivor_picks')
        .insert({ user_id: userId, game_id: gameId, group_id: groupId, week: currentWeek, team })
      if (insertErr) {
        setError('Failed to save pick. Try again.')
        setSaving(false)
        return
      }
    }

    await loadData()
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <Link
          href={`/dashboard`}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Dashboard
        </Link>
        <h1 className="text-lg font-bold text-zinc-100 mt-2">{gameDisplayName}</h1>
        <p className="text-xs text-zinc-500">{groupName}</p>
      </div>

      {/* Status banner */}
      {isEliminated && (
        <div className="mx-4 mt-3 rounded-xl bg-red-900/30 border border-red-700/40 px-4 py-3 text-sm text-red-400">
          You have been eliminated. Better luck next season!
        </div>
      )}
      {!isEliminated && thisWeekPick && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-400">
          Week {currentWeek} pick: <strong>{NFL_TEAMS_BY_ABBR[thisWeekPick.team]?.city} {NFL_TEAMS_BY_ABBR[thisWeekPick.team]?.name ?? thisWeekPick.team}</strong>
          {thisWeekPick.result === 'pending' && ' · Pending'}
          {thisWeekPick.result === 'win' && ' · ✓ Win'}
          {thisWeekPick.result === 'loss' && ' · ✗ Loss'}
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 rounded-xl bg-red-900/30 border border-red-700/40 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 mt-4 mb-1">
        {(['pick', 'scoreboard'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-amber-500 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab === 'pick' ? `Week ${currentWeek} Pick` : 'Scoreboard'}
          </button>
        ))}
      </div>

      {/* Pick tab */}
      {activeTab === 'pick' && (
        <div className="px-4 mt-3">
          {isEliminated ? (
            <p className="text-zinc-500 text-sm text-center py-10">You are eliminated.</p>
          ) : isLocked ? (
            <p className="text-zinc-500 text-sm text-center py-10">Picks for this week are locked.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-3 uppercase tracking-widest">
                Select one team · Week {currentWeek}
              </p>
              {(['AFC', 'NFC'] as const).map((conf) => (
                <div key={conf} className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">{conf}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NFL_TEAMS.filter((t) => t.conference === conf).map((team) => {
                      const alreadyUsed = usedTeams.has(team.abbr) && thisWeekPick?.team !== team.abbr
                      const selected = thisWeekPick?.team === team.abbr
                      return (
                        <button
                          key={team.abbr}
                          disabled={alreadyUsed || saving}
                          onClick={() => void handlePick(team.abbr)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-colors text-sm font-medium ${
                            selected
                              ? 'bg-amber-500 text-zinc-950'
                              : alreadyUsed
                              ? 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed line-through'
                              : 'bg-zinc-800/60 text-zinc-200 hover:bg-zinc-700/60 active:bg-zinc-700'
                          }`}
                        >
                          <span className="text-[10px] font-bold w-7 shrink-0 text-center opacity-60">
                            {team.abbr}
                          </span>
                          <span className="truncate">{team.city} {team.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Scoreboard tab */}
      {activeTab === 'scoreboard' && (
        <div className="mt-3">
          <div className="px-4 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Week {currentWeek} Standings
            </span>
          </div>
          <div className="flex flex-col divide-y divide-zinc-800/60">
            {participants.map((p) => (
              <div
                key={p.userId}
                className={`flex items-center gap-3 px-4 py-3 ${p.isEliminated ? 'opacity-40' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${p.userId === userId ? 'text-amber-400' : 'text-zinc-100'}`}>
                    {p.displayName}
                  </p>
                  {p.currentPick && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {NFL_TEAMS_BY_ABBR[p.currentPick]?.city} {NFL_TEAMS_BY_ABBR[p.currentPick]?.name ?? p.currentPick}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {p.isEliminated ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-red-900/30 text-red-500">
                      Eliminated
                    </span>
                  ) : p.currentPickResult === 'win' ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-green-900/30 text-green-400">
                      Win
                    </span>
                  ) : p.currentPick ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
                      Alive
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-zinc-700/40 text-zinc-500">
                      No Pick
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
