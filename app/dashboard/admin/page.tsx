'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NFL_TEAMS, NFL_TEAMS_BY_ABBR } from '@/lib/nflTeams'
import type { BracketAdmin, BracketMatch, Game, NflMatchup, Team } from '@/lib/types'

type ManagedGame = Pick<
  Game,
  'id' | 'slug' | 'display_name' | 'game_type' | 'status' | 'bracket_id' | 'current_week' | 'season_year'
>

interface MatchEntry extends BracketMatch {
  draftHomeScore: number
  draftAwayScore: number
  draftStatus: 'scheduled' | 'live' | 'completed'
  draftKickoffTime: string
  draftVenue: string
  saving: boolean
}

interface MatchupEntry extends NflMatchup {
  draftHomeTeam: string
  draftAwayTeam: string
  draftKickoffTime: string
  draftStatus: 'scheduled' | 'completed'
  draftWinnerTeam: string | null
  saving: boolean
  isNew?: boolean
}

function toLocalDateTime(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

function toBracketMatchEntry(match: BracketMatch): MatchEntry {
  return {
    ...match,
    draftHomeScore: match.home_score,
    draftAwayScore: match.away_score,
    draftStatus: match.status,
    draftKickoffTime: toLocalDateTime(match.kickoff_time),
    draftVenue: match.venue ?? '',
    saving: false,
  }
}

function toMatchupEntry(matchup: NflMatchup): MatchupEntry {
  return {
    ...matchup,
    draftHomeTeam: matchup.home_team,
    draftAwayTeam: matchup.away_team,
    draftKickoffTime: toLocalDateTime(matchup.kickoff_time),
    draftStatus: matchup.status,
    draftWinnerTeam: matchup.winning_team,
    saving: false,
  }
}

export default function GameAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSiteAdmin, setIsSiteAdmin] = useState(false)
  const [games, setGames] = useState<ManagedGame[]>([])
  const [selectedGameId, setSelectedGameId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<MatchEntry[]>([])
  const [bracketAdmins, setBracketAdmins] = useState<BracketAdmin[]>([])
  const [newBracketAdminUserId, setNewBracketAdminUserId] = useState('')
  const [adminMutationLoading, setAdminMutationLoading] = useState(false)
  const [seasonDraft, setSeasonDraft] = useState(new Date().getFullYear())
  const [currentWeekDraft, setCurrentWeekDraft] = useState(1)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [weekSaving, setWeekSaving] = useState(false)
  const [applyingWeekResults, setApplyingWeekResults] = useState(false)
  const [matchups, setMatchups] = useState<MatchupEntry[]>([])

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId]
  )

  const teamsById = useMemo(
    () => Object.fromEntries(teams.map((team) => [team.id, team])) as Record<string, Team>,
    [teams]
  )

  const loadBaseData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login?next=%2Fdashboard%2Fadmin')
      return
    }

    const [{ data: siteAdmin }, { data: bracketAdminData }] = await Promise.all([
      supabase
        .from('site_admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('bracket_admins')
        .select('bracket_id')
        .eq('user_id', user.id),
    ])

    const hasSiteAdmin = Boolean(siteAdmin)
    setIsSiteAdmin(hasSiteAdmin)

    let gameRows: ManagedGame[] = []

    if (hasSiteAdmin) {
      const { data: allGames } = await supabase
        .from('games')
        .select('id, slug, display_name, game_type, status, bracket_id, current_week, season_year')
        .order('display_name', { ascending: true })

      gameRows = (allGames ?? []) as ManagedGame[]
    } else {
      const bracketIds = Array.from(
        new Set((bracketAdminData ?? []).map((row) => row.bracket_id).filter(Boolean))
      )

      if (bracketIds.length > 0) {
        const { data: bracketGames } = await supabase
          .from('games')
          .select('id, slug, display_name, game_type, status, bracket_id, current_week, season_year')
          .eq('game_type', 'bracket')
          .in('bracket_id', bracketIds)
          .order('display_name', { ascending: true })

        gameRows = (bracketGames ?? []) as ManagedGame[]
      }
    }

    if (gameRows.length === 0) {
      setError('Access denied. You are not assigned to any game operations.')
      setGames([])
      setLoading(false)
      return
    }

    setGames(gameRows)
    if (!selectedGameId || !gameRows.some((game) => game.id === selectedGameId)) {
      setSelectedWeek(gameRows[0].current_week ?? 1)
    }
    setSelectedGameId((prev) => {
      if (prev && gameRows.some((game) => game.id === prev)) return prev
      return gameRows[0].id
    })
    setError(null)
    setLoading(false)
  }, [router, selectedGameId])

  const loadSelectedGame = useCallback(async () => {
    if (!selectedGame) return

    setDetailLoading(true)
    setError(null)
    const supabase = createClient()

    setSeasonDraft(selectedGame.season_year ?? new Date().getFullYear())
    setCurrentWeekDraft(selectedGame.current_week ?? 1)
    setSelectedWeek((prev) => {
      if (prev >= 1 && prev <= 18) return prev
      return selectedGame.current_week ?? 1
    })

    if (selectedGame.game_type === 'bracket' && selectedGame.bracket_id) {
      const [{ data: teamData }, { data: matchData }, { data: bracketAdminData }] = await Promise.all([
        supabase.from('teams').select('*').order('country_name', { ascending: true }),
        supabase
          .from('bracket_matches')
          .select('*')
          .eq('bracket_id', selectedGame.bracket_id)
          .order('match_identifier', { ascending: true }),
        supabase
          .from('bracket_admins')
          .select('*')
          .eq('bracket_id', selectedGame.bracket_id)
          .order('created_at', { ascending: true }),
      ])

      setTeams((teamData ?? []) as Team[])
      setMatches(((matchData ?? []) as BracketMatch[]).map(toBracketMatchEntry))
      setBracketAdmins((bracketAdminData ?? []) as BracketAdmin[])
      setMatchups([])
      setDetailLoading(false)
      return
    }

    if (selectedGame.game_type === 'nfl_survivor') {
      const effectiveSeason = selectedGame.season_year ?? new Date().getFullYear()
      const effectiveWeek = selectedWeek >= 1 && selectedWeek <= 18
        ? selectedWeek
        : selectedGame.current_week ?? 1

      const { data: matchupData } = await supabase
        .from('nfl_matchups')
        .select('*')
        .eq('season_year', effectiveSeason)
        .eq('week', effectiveWeek)
        .order('kickoff_time', { ascending: true })
        .order('home_team', { ascending: true })

      setMatchups(((matchupData ?? []) as NflMatchup[]).map(toMatchupEntry))
      setTeams([])
      setMatches([])
      setBracketAdmins([])
      setDetailLoading(false)
      return
    }

    setTeams([])
    setMatches([])
    setBracketAdmins([])
    setMatchups([])
    setDetailLoading(false)
  }, [selectedGame, selectedWeek])

  useEffect(() => {
    void Promise.resolve().then(loadBaseData)
  }, [loadBaseData])

  useEffect(() => {
    void Promise.resolve().then(loadSelectedGame)
  }, [loadSelectedGame])

  function updateDraftScore(matchId: string, field: 'draftHomeScore' | 'draftAwayScore', value: number) {
    setMatches((prev) => prev.map((match) => (
      match.id === matchId ? { ...match, [field]: value } : match
    )))
  }

  function updateDraftStatus(matchId: string, value: 'scheduled' | 'live' | 'completed') {
    setMatches((prev) => prev.map((match) => (
      match.id === matchId ? { ...match, draftStatus: value } : match
    )))
  }

  function updateDraftTeam(matchId: string, field: 'home_team_id' | 'away_team_id', value: string | null) {
    setMatches((prev) => prev.map((match) => (
      match.id === matchId ? { ...match, [field]: value } : match
    )))
  }

  function updateDraftKickoffTime(matchId: string, value: string) {
    setMatches((prev) => prev.map((match) => (
      match.id === matchId ? { ...match, draftKickoffTime: value } : match
    )))
  }

  function updateDraftVenue(matchId: string, value: string) {
    setMatches((prev) => prev.map((match) => (
      match.id === matchId ? { ...match, draftVenue: value } : match
    )))
  }

  async function saveMatch(matchId: string) {
    const match = matches.find((entry) => entry.id === matchId)
    if (!match) return

    if (match.home_team_id && match.home_team_id === match.away_team_id) {
      setError('Home and away teams must be different.')
      return
    }

    setMatches((prev) => prev.map((entry) => (
      entry.id === matchId ? { ...entry, saving: true } : entry
    )))

    let winningTeamId: string | null = match.winning_team_id
    if (match.draftStatus === 'completed') {
      if (match.draftHomeScore > match.draftAwayScore) winningTeamId = match.home_team_id
      else if (match.draftAwayScore > match.draftHomeScore) winningTeamId = match.away_team_id
      else winningTeamId = null
    }

    const supabase = createClient()
    const { error: upsertErr } = await supabase
      .from('bracket_matches')
      .upsert(
        {
          id: match.id,
          bracket_id: match.bracket_id,
          match_identifier: match.match_identifier,
          round_name: match.round_name,
          home_placeholder: match.home_placeholder,
          away_placeholder: match.away_placeholder,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_score: match.draftHomeScore,
          away_score: match.draftAwayScore,
          status: match.draftStatus,
          winning_team_id: winningTeamId,
          kickoff_time: match.draftKickoffTime ? new Date(match.draftKickoffTime).toISOString() : null,
          venue: match.draftVenue.trim() || null,
        },
        { onConflict: 'id' }
      )

    if (upsertErr) setError(upsertErr.message)
    else await loadSelectedGame()

    setMatches((prev) => prev.map((entry) => (
      entry.id === matchId ? { ...entry, saving: false } : entry
    )))
  }

  async function addBracketAdmin() {
    if (!selectedGame?.bracket_id) return
    const userId = newBracketAdminUserId.trim()
    if (!userId) {
      setError('Enter a user ID to add as bracket admin.')
      return
    }

    setAdminMutationLoading(true)
    const supabase = createClient()
    const { error: insertErr } = await supabase
      .from('bracket_admins')
      .insert({ bracket_id: selectedGame.bracket_id, user_id: userId })

    if (insertErr) setError(insertErr.message)
    else {
      setNewBracketAdminUserId('')
      await loadSelectedGame()
    }

    setAdminMutationLoading(false)
  }

  async function removeBracketAdmin(rowId: string) {
    setAdminMutationLoading(true)
    const supabase = createClient()
    const { error: deleteErr } = await supabase
      .from('bracket_admins')
      .delete()
      .eq('id', rowId)

    if (deleteErr) setError(deleteErr.message)
    else await loadSelectedGame()

    setAdminMutationLoading(false)
  }

  function addBlankMatchup() {
    if (!selectedGame) return

    const seasonYear = seasonDraft || selectedGame.season_year || new Date().getFullYear()
    const week = selectedWeek || currentWeekDraft || 1
    const emptyTeam = NFL_TEAMS[0]?.abbr ?? 'BUF'

    setMatchups((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        season_year: seasonYear,
        week,
        home_team: emptyTeam,
        away_team: NFL_TEAMS[1]?.abbr ?? 'MIA',
        kickoff_time: null,
        status: 'scheduled',
        winning_team: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        draftHomeTeam: emptyTeam,
        draftAwayTeam: NFL_TEAMS[1]?.abbr ?? 'MIA',
        draftKickoffTime: '',
        draftStatus: 'scheduled',
        draftWinnerTeam: null,
        saving: false,
        isNew: true,
      },
    ])
  }

  function updateMatchupDraft(matchupId: string, patch: Partial<MatchupEntry>) {
    setMatchups((prev) => prev.map((matchup) => (
      matchup.id === matchupId ? { ...matchup, ...patch } : matchup
    )))
  }

  async function saveMatchup(matchupId: string) {
    const matchup = matchups.find((entry) => entry.id === matchupId)
    if (!matchup) return

    if (matchup.draftHomeTeam === matchup.draftAwayTeam) {
      setError('Home and away NFL teams must be different.')
      return
    }

    if (
      matchup.draftWinnerTeam &&
      ![matchup.draftHomeTeam, matchup.draftAwayTeam].includes(matchup.draftWinnerTeam)
    ) {
      setError('Winner must be one of the two teams in the matchup.')
      return
    }

    const nextStatus = matchup.draftWinnerTeam ? 'completed' : matchup.draftStatus

    setMatchups((prev) => prev.map((entry) => (
      entry.id === matchupId ? { ...entry, saving: true } : entry
    )))

    const supabase = createClient()
    const payload = {
      ...(matchup.isNew ? {} : { id: matchup.id }),
      season_year: seasonDraft,
      week: selectedWeek,
      home_team: matchup.draftHomeTeam,
      away_team: matchup.draftAwayTeam,
      kickoff_time: matchup.draftKickoffTime ? new Date(matchup.draftKickoffTime).toISOString() : null,
      status: nextStatus,
      winning_team: nextStatus === 'completed' ? matchup.draftWinnerTeam : null,
      updated_at: new Date().toISOString(),
    }

    const { error: saveErr } = matchup.isNew
      ? await supabase.from('nfl_matchups').insert(payload)
      : await supabase.from('nfl_matchups').update(payload).eq('id', matchup.id)

    if (saveErr) setError(saveErr.message)
    else await loadSelectedGame()

    setMatchups((prev) => prev.map((entry) => (
      entry.id === matchupId ? { ...entry, saving: false } : entry
    )))
  }

  async function deleteMatchup(matchupId: string) {
    const matchup = matchups.find((entry) => entry.id === matchupId)
    if (!matchup) return

    if (matchup.isNew) {
      setMatchups((prev) => prev.filter((entry) => entry.id !== matchupId))
      return
    }

    const supabase = createClient()
    const { error: deleteErr } = await supabase
      .from('nfl_matchups')
      .delete()
      .eq('id', matchupId)

    if (deleteErr) setError(deleteErr.message)
    else await loadSelectedGame()
  }

  async function saveGameWeekSettings() {
    if (!selectedGame) return

    setWeekSaving(true)
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('games')
      .update({
        current_week: Math.min(18, Math.max(1, currentWeekDraft)),
        season_year: seasonDraft,
      })
      .eq('id', selectedGame.id)

    if (updateErr) {
      setError(updateErr.message)
      setWeekSaving(false)
      return
    }

    await loadBaseData()
    setSelectedWeek(Math.min(18, Math.max(1, currentWeekDraft)))
    setWeekSaving(false)
  }

  async function applyWeekResults() {
    if (!selectedGame) return

    setApplyingWeekResults(true)
    setError(null)
    const supabase = createClient()
    const { error: rpcErr } = await supabase.rpc('apply_nfl_week_results', {
      target_game_id: selectedGame.id,
      target_week: selectedWeek,
    })

    if (rpcErr) setError(rpcErr.message)
    setApplyingWeekResults(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
      </div>
    )
  }

  if (error && games.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      <div className="px-4 pt-6 pb-4 border-b border-zinc-800/60">
        <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Dashboard
        </Link>
        <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">Game Operations</p>
        <h1
          className="text-xl font-bold text-zinc-100 mt-1"
          style={{ fontFamily: 'Georgia, \"Times New Roman\", serif' }}
        >
          Shared Results Admin
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Manage official outcomes once and reuse them across every linked pool.
        </p>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 rounded-full px-2.5 py-1 ring-1 ring-amber-500/30">
            {isSiteAdmin ? 'Site Admin Access' : 'Bracket Admin Access'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/60">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Games
            </p>
          </div>
          <div className="flex flex-col divide-y divide-zinc-800/60">
            {games.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => {
                  setSelectedGameId(game.id)
                  setSelectedWeek(game.current_week ?? 1)
                }}
                className={`px-4 py-3 text-left transition-colors ${
                  game.id === selectedGameId ? 'bg-amber-500/10' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{game.display_name}</p>
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500 mt-1">
                      {game.game_type === 'bracket' ? 'Bracket Game' : 'NFL Survivor'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                    {game.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedGame && (
        <div className="px-4 pt-4 flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Selected Game
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-100">{selectedGame.display_name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                {selectedGame.game_type === 'bracket' ? 'Bracket' : 'NFL Survivor'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                {selectedGame.status}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                Slug: {selectedGame.slug}
              </span>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
            </div>
          ) : selectedGame.game_type === 'bracket' ? (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/60">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                    Official Bracket Outcomes
                  </p>
                </div>
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  {matches.map((match) => {
                    const homeName = match.home_team_id
                      ? `${teamsById[match.home_team_id]?.flag_emoji ?? ''} ${teamsById[match.home_team_id]?.country_name ?? ''}`.trim()
                      : match.home_placeholder || 'TBD'
                    const awayName = match.away_team_id
                      ? `${teamsById[match.away_team_id]?.flag_emoji ?? ''} ${teamsById[match.away_team_id]?.country_name ?? ''}`.trim()
                      : match.away_placeholder || 'TBD'

                    return (
                      <div key={match.id} className="px-4 py-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              {match.match_identifier}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">{match.round_name}</p>
                          </div>
                          <select
                            value={match.draftStatus}
                            onChange={(e) => updateDraftStatus(match.id, e.target.value as 'scheduled' | 'live' | 'completed')}
                            className="text-[11px] font-semibold uppercase tracking-wide bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="scheduled">Scheduled</option>
                            <option value="live">Live</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Home Team</span>
                            <select
                              value={match.home_team_id ?? ''}
                              onChange={(e) => updateDraftTeam(match.id, 'home_team_id', e.target.value || null)}
                              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="">{match.home_placeholder || 'Select team'}</option>
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.flag_emoji} {team.country_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Away Team</span>
                            <select
                              value={match.away_team_id ?? ''}
                              onChange={(e) => updateDraftTeam(match.id, 'away_team_id', e.target.value || null)}
                              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="">{match.away_placeholder || 'Select team'}</option>
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.flag_emoji} {team.country_name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Kickoff</span>
                            <input
                              type="datetime-local"
                              value={match.draftKickoffTime}
                              onChange={(e) => updateDraftKickoffTime(match.id, e.target.value)}
                              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Venue</span>
                            <input
                              type="text"
                              value={match.draftVenue}
                              onChange={(e) => updateDraftVenue(match.id, e.target.value)}
                              className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium truncate">{homeName}</span>
                            <input
                              type="number"
                              min={0}
                              value={match.draftHomeScore}
                              onChange={(e) => updateDraftScore(match.id, 'draftHomeScore', Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-center text-lg font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                          <span className="text-zinc-600 font-bold text-lg mt-4">–</span>
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-medium truncate text-right">{awayName}</span>
                            <input
                              type="number"
                              min={0}
                              value={match.draftAwayScore}
                              onChange={(e) => updateDraftScore(match.id, 'draftAwayScore', Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-center text-lg font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void saveMatch(match.id)}
                          disabled={match.saving}
                          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm py-2.5 transition-colors"
                        >
                          {match.saving ? 'Saving…' : 'Save Match'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Bracket Admin Access</p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newBracketAdminUserId}
                    onChange={(e) => setNewBracketAdminUserId(e.target.value)}
                    placeholder="User UUID"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => void addBracketAdmin()}
                    disabled={adminMutationLoading}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm px-4 py-2"
                  >
                    Add Admin
                  </button>
                </div>

                <div className="mt-4 flex flex-col divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 overflow-hidden">
                  {bracketAdmins.length === 0 ? (
                    <div className="px-4 py-8 text-center text-zinc-600 text-sm">No bracket admins configured.</div>
                  ) : (
                    bracketAdmins.map((admin) => (
                      <div key={admin.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-200 font-mono truncate">{admin.user_id}</p>
                          <p className="text-[11px] text-zinc-600">Added {new Date(admin.created_at).toLocaleString()}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeBracketAdmin(admin.id)}
                          disabled={adminMutationLoading}
                          className="rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50 font-semibold text-xs px-3 py-1.5"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">NFL Game Settings</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Season</span>
                    <input
                      type="number"
                      value={seasonDraft}
                      onChange={(e) => setSeasonDraft(parseInt(e.target.value) || new Date().getFullYear())}
                      className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Current Week</span>
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={currentWeekDraft}
                      onChange={(e) => setCurrentWeekDraft(Math.min(18, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void saveGameWeekSettings()}
                      disabled={weekSaving || !isSiteAdmin}
                      className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm py-2.5 transition-colors"
                    >
                      {weekSaving ? 'Saving…' : 'Save Game Settings'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Review Week</span>
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(Math.min(18, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    Shared weekly outcomes entered here will update every survivor pool linked to this game.
                  </p>
                  <button
                    type="button"
                    onClick={() => void applyWeekResults()}
                    disabled={applyingWeekResults || !isSiteAdmin}
                    className="rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm px-4 py-2.5 transition-colors"
                  >
                    {applyingWeekResults ? 'Applying…' : 'Apply Week Results'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      Week {selectedWeek} Matchups
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">Pick the official winner for each NFL game once.</p>
                  </div>
                  {isSiteAdmin && (
                    <button
                      type="button"
                      onClick={addBlankMatchup}
                      className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-1.5 transition-colors"
                    >
                      Add Matchup
                    </button>
                  )}
                </div>

                {matchups.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm text-zinc-500">No NFL matchups added for this week yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-zinc-800/60">
                    {matchups.map((matchup) => (
                      <div key={matchup.id} className="px-4 py-4 flex flex-col gap-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Home Team</span>
                            <select
                              value={matchup.draftHomeTeam}
                              onChange={(e) => updateMatchupDraft(matchup.id, { draftHomeTeam: e.target.value })}
                              className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              {NFL_TEAMS.map((team) => (
                                <option key={team.abbr} value={team.abbr}>
                                  {team.city} {team.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Away Team</span>
                            <select
                              value={matchup.draftAwayTeam}
                              onChange={(e) => updateMatchupDraft(matchup.id, { draftAwayTeam: e.target.value })}
                              className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              {NFL_TEAMS.map((team) => (
                                <option key={team.abbr} value={team.abbr}>
                                  {team.city} {team.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Kickoff</span>
                            <input
                              type="datetime-local"
                              value={matchup.draftKickoffTime}
                              onChange={(e) => updateMatchupDraft(matchup.id, { draftKickoffTime: e.target.value })}
                              className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Status</span>
                            <select
                              value={matchup.draftStatus}
                              onChange={(e) => updateMatchupDraft(matchup.id, {
                                draftStatus: e.target.value as 'scheduled' | 'completed',
                                draftWinnerTeam: e.target.value === 'scheduled' ? null : matchup.draftWinnerTeam,
                              })}
                              className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="scheduled">Scheduled</option>
                              <option value="completed">Completed</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Winner</span>
                            <select
                              value={matchup.draftWinnerTeam ?? ''}
                              onChange={(e) => updateMatchupDraft(matchup.id, {
                                draftWinnerTeam: e.target.value || null,
                                draftStatus: e.target.value ? 'completed' : matchup.draftStatus,
                              })}
                              className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="">No winner yet</option>
                              {[matchup.draftHomeTeam, matchup.draftAwayTeam].map((teamAbbr) => (
                                <option key={teamAbbr} value={teamAbbr}>
                                  {NFL_TEAMS_BY_ABBR[teamAbbr]?.city} {NFL_TEAMS_BY_ABBR[teamAbbr]?.name ?? teamAbbr}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-zinc-500">
                            {NFL_TEAMS_BY_ABBR[matchup.draftHomeTeam]?.city} vs {NFL_TEAMS_BY_ABBR[matchup.draftAwayTeam]?.city}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void deleteMatchup(matchup.id)}
                              className="rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold px-3 py-1.5 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveMatchup(matchup.id)}
                              disabled={matchup.saving || !isSiteAdmin}
                              className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold px-3 py-1.5 transition-colors"
                            >
                              {matchup.saving ? 'Saving…' : 'Save Matchup'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
