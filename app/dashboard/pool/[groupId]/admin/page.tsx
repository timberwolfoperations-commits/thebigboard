'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BracketMatch } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────
interface MemberRow {
  membershipId: string
  userId: string
  displayName: string
  hasPaid: boolean
}

interface MatchEntry extends BracketMatch {
  draftHomeScore: number
  draftAwayScore: number
  draftStatus: 'scheduled' | 'live' | 'completed'
  saving: boolean
}

type ActiveTab = 'ledger' | 'scores'

// ── Component ──────────────────────────────────────────────────
export default function AdminPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.groupId as string

  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [matches, setMatches] = useState<MatchEntry[]>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    // ── Admin guard ──────────────────────────────────────────
    const { data: myMembership } = await supabase
      .from('group_memberships')
      .select('is_admin')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single()

    if (!myMembership?.is_admin) {
      setError('Access denied. You must be a group admin to view this page.')
      setLoading(false)
      return
    }

    // ── Payment ledger: fetch all members ────────────────────
    const { data: memberData } = await supabase
      .from('group_memberships')
      .select('id, user_id, has_paid')
      .eq('group_id', groupId)

    if (memberData) {
      setMembers(
        memberData.map((m) => ({
          membershipId: m.id,
          userId: m.user_id,
          displayName:
            m.user_id === user.id
              ? (user.email ?? `User ${m.user_id.slice(0, 6)}`)
              : `Player ${m.user_id.slice(0, 6)}`,
          hasPaid: m.has_paid,
        }))
      )
    }

    // ── Score entry: find bracket for this group ─────────────
    const { data: contest } = await supabase
      .from('group_bracket_contests')
      .select('bracket_id')
      .eq('group_id', groupId)
      .single()

    if (contest) {
      const { data: matchData } = await supabase
        .from('bracket_matches')
        .select('*')
        .eq('bracket_id', contest.bracket_id)
        .order('match_identifier', { ascending: true })

      if (matchData) {
        setMatches(
          (matchData as BracketMatch[]).map((m) => ({
            ...m,
            draftHomeScore: m.home_score,
            draftAwayScore: m.away_score,
            draftStatus: m.status,
            saving: false,
          }))
        )
      }
    }

    setLoading(false)
  }, [groupId, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Toggle payment status ────────────────────────────────────
  async function togglePayment(membershipId: string, currentStatus: boolean) {
    setTogglingId(membershipId)
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) =>
        m.membershipId === membershipId ? { ...m, hasPaid: !currentStatus } : m
      )
    )

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('group_memberships')
      .update({ has_paid: !currentStatus })
      .eq('id', membershipId)

    if (updateErr) {
      // Revert on failure
      setMembers((prev) =>
        prev.map((m) =>
          m.membershipId === membershipId ? { ...m, hasPaid: currentStatus } : m
        )
      )
      setError(updateErr.message)
    }
    setTogglingId(null)
  }

  // ── Update match draft fields ────────────────────────────────
  function updateDraftScore(
    matchId: string,
    field: 'draftHomeScore' | 'draftAwayScore',
    value: number
  ) {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, [field]: value } : m))
    )
  }

  function updateDraftStatus(
    matchId: string,
    value: 'scheduled' | 'live' | 'completed'
  ) {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, draftStatus: value } : m))
    )
  }

  // ── Save match result ────────────────────────────────────────
  async function saveMatch(matchId: string) {
    const match = matches.find((m) => m.id === matchId)
    if (!match) return

    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, saving: true } : m))
    )

    // Auto-compute winning_team_id when completed
    let winningTeamId: string | null = match.winning_team_id
    if (match.draftStatus === 'completed') {
      if (match.draftHomeScore > match.draftAwayScore) {
        winningTeamId = match.home_team_id
      } else if (match.draftAwayScore > match.draftHomeScore) {
        winningTeamId = match.away_team_id
      } else {
        winningTeamId = null
      }
    }

    const supabase = createClient()
    const { error: upsertErr } = await supabase
      .from('bracket_matches')
      .upsert(
        {
          bracket_id: match.bracket_id,
          match_identifier: match.match_identifier,
          round_name: match.round_name,
          home_score: match.draftHomeScore,
          away_score: match.draftAwayScore,
          status: match.draftStatus,
          winning_team_id: winningTeamId,
        },
        { onConflict: 'bracket_id,match_identifier' }
      )

    if (upsertErr) {
      setError(upsertErr.message)
    } else {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? {
                ...m,
                home_score: match.draftHomeScore,
                away_score: match.draftAwayScore,
                status: match.draftStatus,
                winning_team_id: winningTeamId,
              }
            : m
        )
      )
    }

    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, saving: false } : m))
    )
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-24">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  // ── Access denied ────────────────────────────────────────────
  if (error && members.length === 0 && matches.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="w-14 h-14 rounded-full bg-zinc-800/60 flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-500"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-zinc-300 font-semibold text-sm mb-1">Access Denied</p>
        <p className="text-zinc-500 text-xs max-w-xs mx-auto">{error}</p>
      </div>
    )
  }

  // ── Main UI ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-zinc-800/60">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-0.5">
          Commissioner
        </p>
        <h2
          className="text-xl font-bold text-zinc-100"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Control Panel
        </h2>
        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 rounded-full px-2.5 py-1 ring-1 ring-amber-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Admin Access
          </span>
        </div>
      </div>

      {/* Inline error toast */}
      {error && (members.length > 0 || matches.length > 0) && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800/60 mt-1">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
            activeTab === 'ledger'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Payment Ledger
        </button>
        <button
          onClick={() => setActiveTab('scores')}
          className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
            activeTab === 'scores'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Score Entry
        </button>
      </div>

      {/* ── Tab: Payment Ledger ────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="flex flex-col divide-y divide-zinc-800/60">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Member
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Status
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Toggle
            </span>
          </div>

          {members.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-zinc-500 text-sm">No members in this group yet.</p>
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.membershipId}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3.5"
              >
                {/* Member name */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {member.displayName}
                  </p>
                  <p className="text-[11px] text-zinc-600 font-mono mt-0.5">
                    {member.userId.slice(0, 8)}…
                  </p>
                </div>

                {/* Payment badge */}
                <div className="shrink-0">
                  {member.hasPaid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Paid
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      Unpaid
                    </span>
                  )}
                </div>

                {/* Toggle button */}
                <button
                  onClick={() => togglePayment(member.membershipId, member.hasPaid)}
                  disabled={togglingId === member.membershipId}
                  aria-label={
                    member.hasPaid ? 'Mark as unpaid' : 'Mark as paid'
                  }
                  className={`shrink-0 w-11 h-6 rounded-full relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 ${
                    member.hasPaid ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      member.hasPaid ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Score Entry ───────────────────────────────── */}
      {activeTab === 'scores' && (
        <div className="flex flex-col divide-y divide-zinc-800/60">
          {matches.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-zinc-500 text-sm">
                No matches found for this group&apos;s bracket.
              </p>
            </div>
          ) : (
            matches.map((match) => {
              const homeName = match.home_placeholder || 'TBD'
              const awayName = match.away_placeholder || 'TBD'

              return (
                <div key={match.id} className="px-4 py-4 flex flex-col gap-3">
                  {/* Match label */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {match.match_identifier}
                      </span>
                      <span className="ml-2 text-[10px] text-zinc-600 uppercase tracking-wide">
                        {match.round_name}
                      </span>
                    </div>
                    {/* Status selector */}
                    <select
                      value={match.draftStatus}
                      onChange={(e) =>
                        updateDraftStatus(
                          match.id,
                          e.target.value as 'scheduled' | 'live' | 'completed'
                        )
                      }
                      className="text-[11px] font-semibold uppercase tracking-wide bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  {/* Score row */}
                  <div className="flex items-center gap-2">
                    {/* Home team */}
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-500 font-medium truncate">
                        {homeName}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={match.draftHomeScore}
                        onChange={(e) =>
                          updateDraftScore(
                            match.id,
                            'draftHomeScore',
                            Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-center text-lg font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Divider */}
                    <span className="text-zinc-600 font-bold text-lg mt-4">–</span>

                    {/* Away team */}
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-500 font-medium truncate text-right">
                        {awayName}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={match.draftAwayScore}
                        onChange={(e) =>
                          updateDraftScore(
                            match.id,
                            'draftAwayScore',
                            Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-center text-lg font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    onClick={() => saveMatch(match.id)}
                    disabled={match.saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm px-4 py-2.5 transition-colors"
                  >
                    {match.saving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-zinc-800/40 border-t-zinc-900 rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Save Result'
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
