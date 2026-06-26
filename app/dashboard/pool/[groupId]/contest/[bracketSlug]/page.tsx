'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BracketTree from '@/components/BracketTree'
import Scoreboard from '@/components/Scoreboard'
import type { BracketMatch, BracketUserPick, Team } from '@/lib/types'

const LOCK_DEADLINE = new Date('2026-06-28T00:00:00Z')

// Hardcoded fallback for the 16 standard World Cup knockout match slots.
// Used only when the database returns no bracket_matches rows, so the
// BracketTree component always has data to render.
const KNOCKOUT_FALLBACK_MATCHES: BracketMatch[] = [
  { id: 'fb-r16-01', bracket_id: '', match_identifier: 'R16-01', round_name: 'Round of 16', home_placeholder: 'Winner Group A', away_placeholder: 'Runner-up Group B', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-02', bracket_id: '', match_identifier: 'R16-02', round_name: 'Round of 16', home_placeholder: 'Winner Group C', away_placeholder: 'Runner-up Group D', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-03', bracket_id: '', match_identifier: 'R16-03', round_name: 'Round of 16', home_placeholder: 'Winner Group E', away_placeholder: 'Runner-up Group F', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-04', bracket_id: '', match_identifier: 'R16-04', round_name: 'Round of 16', home_placeholder: 'Winner Group G', away_placeholder: 'Runner-up Group H', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-05', bracket_id: '', match_identifier: 'R16-05', round_name: 'Round of 16', home_placeholder: 'Winner Group B', away_placeholder: 'Runner-up Group A', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-06', bracket_id: '', match_identifier: 'R16-06', round_name: 'Round of 16', home_placeholder: 'Winner Group D', away_placeholder: 'Runner-up Group C', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-07', bracket_id: '', match_identifier: 'R16-07', round_name: 'Round of 16', home_placeholder: 'Winner Group F', away_placeholder: 'Runner-up Group E', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-r16-08', bracket_id: '', match_identifier: 'R16-08', round_name: 'Round of 16', home_placeholder: 'Winner Group H', away_placeholder: 'Runner-up Group G', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-qf-01', bracket_id: '', match_identifier: 'QF-01', round_name: 'Quarterfinals', home_placeholder: 'Winner R16-01', away_placeholder: 'Winner R16-02', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-qf-02', bracket_id: '', match_identifier: 'QF-02', round_name: 'Quarterfinals', home_placeholder: 'Winner R16-03', away_placeholder: 'Winner R16-04', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-qf-03', bracket_id: '', match_identifier: 'QF-03', round_name: 'Quarterfinals', home_placeholder: 'Winner R16-05', away_placeholder: 'Winner R16-06', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-qf-04', bracket_id: '', match_identifier: 'QF-04', round_name: 'Quarterfinals', home_placeholder: 'Winner R16-07', away_placeholder: 'Winner R16-08', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-sf-01', bracket_id: '', match_identifier: 'SF-01', round_name: 'Semifinals', home_placeholder: 'Winner QF-01', away_placeholder: 'Winner QF-02', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-sf-02', bracket_id: '', match_identifier: 'SF-02', round_name: 'Semifinals', home_placeholder: 'Winner QF-03', away_placeholder: 'Winner QF-04', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-3p-01', bracket_id: '', match_identifier: '3P-01', round_name: 'Third Place', home_placeholder: 'Loser SF-01', away_placeholder: 'Loser SF-02', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
  { id: 'fb-f-01', bracket_id: '', match_identifier: 'F-01', round_name: 'Final', home_placeholder: 'Winner SF-01', away_placeholder: 'Winner SF-02', home_team_id: null, away_team_id: null, home_score: 0, away_score: 0, status: 'scheduled', winning_team_id: null, kickoff_time: null, venue: null },
]

interface ScoreEntry {
  userId: string
  displayName: string
  correctPicks: number
  totalPicks: number
  hasPaid: boolean
}

export default function ContestPage() {
  const params = useParams()
  const groupId = params.groupId as string
  const bracketSlug = params.bracketSlug as string

  const [userId, setUserId] = useState<string | null>(null)
  const [bracketId, setBracketId] = useState<string | null>(null)
  const [lockDeadline, setLockDeadline] = useState<Date>(LOCK_DEADLINE)
  const [bracketDisplayName, setBracketDisplayName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [matches, setMatches] = useState<BracketMatch[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<BracketUserPick[]>([])
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const teamsById = useMemo(
    () =>
      Object.fromEntries(teams.map((team) => [team.id, team])) as Record<string, Team>,
    [teams]
  )

  const isLocked =
    picks.some((p) => p.is_locked) || new Date() > lockDeadline

  // ── Load all data ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function loadData(showLoader = true) {
      if (showLoader) {
        setLoading(true)
      }
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      setUserId(user.id)

      // 1. Fetch the bracket linked to this group contest
      //    Primary: look up via group_bracket_contests join table
      //    Fallback: resolve bracket directly by URL slug
      const { data: contest } = await supabase
        .from('group_bracket_contests')
        .select('bracket_id')
        .eq('group_id', groupId)
        .single()

      let bracket: {
        id: string
        slug: string
        display_name: string
        lock_deadline: string | null
      } | null = null

      if (contest?.bracket_id) {
        const { data } = await supabase
          .from('brackets')
          .select('id, slug, display_name, lock_deadline')
          .eq('id', contest.bracket_id)
          .single()
        bracket = data
      }

      // Fallback: resolve bracket directly by the URL slug
      if (!bracket) {
        const { data } = await supabase
          .from('brackets')
          .select('id, slug, display_name, lock_deadline')
          .eq('slug', bracketSlug)
          .single()
        bracket = data
      }

      if (!bracket) {
        if (!cancelled) {
          setError('Tournament not found.')
          setLoading(false)
        }
        return
      }

      setBracketId(bracket.id)
      setBracketDisplayName(bracket.display_name)
      if (bracket.lock_deadline) {
        setLockDeadline(new Date(bracket.lock_deadline))
      }

      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .order('country_name', { ascending: true })

      if (!cancelled) {
        setTeams((teamData ?? []) as Team[])
      }

      // 2. Fetch group name
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .single()

      if (group && !cancelled) setGroupName(group.name)

      // 3. Fetch matches ordered by round/identifier
      const { data: matchData } = await supabase
        .from('bracket_matches')
        .select('*')
        .eq('bracket_id', bracket.id)
        .order('match_identifier', { ascending: true })

      let resolvedMatches = (matchData ?? []) as BracketMatch[]

      // Fallback: if no matches found, try resolving by slug directly
      // (handles case where bracket_id was resolved via slug fallback above)
      if (resolvedMatches.length === 0 && bracket.slug) {
        const { data: fallbackBracket } = await supabase
          .from('brackets')
          .select('id')
          .eq('slug', bracket.slug)
          .single()

        if (fallbackBracket) {
          const { data: fallbackMatches } = await supabase
            .from('bracket_matches')
            .select('*')
            .eq('bracket_id', fallbackBracket.id)
            .order('match_identifier', { ascending: true })

          resolvedMatches = (fallbackMatches ?? []) as BracketMatch[]
        }
      }

      // Last-resort hardcoded fallback: 16 standard knockout slots
      if (resolvedMatches.length === 0) {
        resolvedMatches = KNOCKOUT_FALLBACK_MATCHES.map((m) => ({
          ...m,
          bracket_id: bracket!.id,
        }))
      }

      if (!cancelled) setMatches(resolvedMatches)

      // 4. Fetch current user's picks for this group
      const { data: pickData } = await supabase
        .from('bracket_user_picks')
        .select('*')
        .eq('user_id', user.id)
        .eq('group_id', groupId)
        .eq('bracket_id', bracket.id)

      if (!cancelled) setPicks((pickData ?? []) as BracketUserPick[])

      // 5. Build leaderboard from group memberships + picks
      const { data: members } = await supabase
        .from('group_memberships')
        .select('user_id, has_paid')
        .eq('group_id', groupId)

      if (members) {
        const completedMatches = resolvedMatches.filter(
          (m) => m.status === 'completed' && m.winning_team_id
        )

        const entries: ScoreEntry[] = await Promise.all(
          members.map(async (member) => {
            const { data: memberPicks } = await supabase
              .from('bracket_user_picks')
              .select('match_id, choice_team_id')
              .eq('user_id', member.user_id)
              .eq('group_id', groupId)
              .eq('bracket_id', bracket.id)

            const correct = completedMatches.filter((m) =>
              memberPicks?.some(
                (p) => p.match_id === m.id && p.choice_team_id === m.winning_team_id
              )
            ).length

            return {
              userId: member.user_id,
              displayName: member.user_id === user.id ? user.email ?? 'You' : `Player ${member.user_id.slice(0, 6)}`,
              correctPicks: correct,
              totalPicks: memberPicks?.length ?? 0,
              hasPaid: member.has_paid,
            }
          })
        )

        if (!cancelled) setLeaderboard(entries)
      }

      if (!channel) {
        channel = supabase
          .channel(`contest:${groupId}:${bracket.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'bracket_matches',
              filter: `bracket_id=eq.${bracket.id}`,
            },
            () => {
              void loadData(false)
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'bracket_user_picks',
              filter: `group_id=eq.${groupId}`,
            },
            () => {
              void loadData(false)
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'group_memberships',
              filter: `group_id=eq.${groupId}`,
            },
            () => {
              void loadData(false)
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'teams',
            },
            () => {
              void loadData(false)
            }
          )
          .subscribe()
      }

      if (!cancelled) setLoading(false)
    }

    void loadData()

    return () => {
      cancelled = true
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [groupId, bracketSlug])

  // ── Handle pick ────────────────────────────────────────────
  async function handlePick(matchId: string, teamId: string) {
    if (isLocked || !userId || !bracketId) return

    setSaving(true)
    const supabase = createClient()

    const { error: upsertErr } = await supabase
      .from('bracket_user_picks')
      .upsert(
        {
          user_id: userId,
          group_id: groupId,
          bracket_id: bracketId,
          match_id: matchId,
          choice_team_id: teamId,
          is_locked: false,
        },
        { onConflict: 'user_id,group_id,match_id' }
      )

    if (upsertErr) {
      setError(upsertErr.message)
    } else {
      // Optimistically update local picks
      setPicks((prev) => {
        const existing = prev.findIndex((p) => p.match_id === matchId)
        const newPick: BracketUserPick = {
          id: `optimistic-${matchId}`,
          user_id: userId,
          group_id: groupId,
          bracket_id: bracketId,
          match_id: matchId,
          choice_team_id: teamId,
          is_locked: false,
        }
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = newPick
          return updated
        }
        return [...prev, newPick]
      })
    }

    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-24">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-zinc-800/60">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-0.5">
          {groupName}
        </p>
        <h2
          className="text-xl font-bold text-zinc-100"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {bracketDisplayName}
        </h2>

        {/* Lock status */}
        <div className="mt-2 flex items-center gap-2">
          {isLocked ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 bg-zinc-800/60 rounded-full px-2.5 py-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Locked – Read Only
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 rounded-full px-2.5 py-1 ring-1 ring-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Open – Picks Enabled
            </span>
          )}
          {saving && (
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <span className="w-3 h-3 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              Saving…
            </span>
          )}
        </div>
      </div>

      {/* STATE A: Locked – show static bracket + scoreboard */}
      {isLocked ? (
        <>
          <div className="pt-4">
            <div className="px-4 mb-3">
              <h3 className="text-xs uppercase tracking-widest font-semibold text-zinc-500">
                Bracket Results
              </h3>
            </div>
            <BracketTree
              matches={matches}
              picks={picks}
              isLocked={true}
              teamsById={teamsById}
            />
          </div>
          <div className="border-t border-zinc-800/60 mt-4">
            <Scoreboard entries={leaderboard} currentUserId={userId ?? ''} />
          </div>
        </>
      ) : (
        /* STATE B: Open – interactive picks */
        <div className="pt-4">
          <div className="px-4 mb-3 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-widest font-semibold text-zinc-500">
              Make Your Picks
            </h3>
            <span className="text-[11px] text-zinc-600">
              {picks.length} / {matches.length} picked
            </span>
          </div>
          <BracketTree
            matches={matches}
            picks={picks}
            isLocked={false}
            teamsById={teamsById}
            onPick={handlePick}
          />
          {matches.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-zinc-600 text-sm">
                Matches haven&apos;t been scheduled yet. Check back soon.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
