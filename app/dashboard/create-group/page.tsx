'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getIsSiteAdmin } from '@/lib/supabase/roles'

interface ManagedGame {
  id: string
  slug: string
  display_name: string
  game_type: 'bracket' | 'nfl_survivor'
  status: 'draft' | 'active' | 'closed' | 'archived'
  bracket_id: string | null
  lock_deadline: string | null
}

interface BracketOption {
  id: string
  slug: string
  display_name: string
  lock_deadline: string | null
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatDeadline(iso: string | null): string {
  if (!iso) return 'No lock deadline'
  return new Date(iso).toLocaleString()
}

export default function CreateGroupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [games, setGames] = useState<ManagedGame[]>([])
  const [brackets, setBrackets] = useState<BracketOption[]>([])
  const [poolType, setPoolType] = useState<'bracket' | 'nfl_survivor'>(() => {
    return searchParams.get('poolType') === 'nfl_survivor' ? 'nfl_survivor' : 'bracket'
  })
  const [selectedGameId, setSelectedGameId] = useState('')
  const [poolName, setPoolName] = useState(() => {
    if (searchParams.get('mode') !== 'test') {
      return ''
    }

    return searchParams.get('poolType') === 'nfl_survivor'
      ? 'Test Survivor Pool'
      : 'Test Bracket Pool'
  })
  const [gameName, setGameName] = useState('')
  const [gameSlug, setGameSlug] = useState('')
  const [gameType, setGameType] = useState<'bracket' | 'nfl_survivor'>('bracket')
  const [selectedBracketId, setSelectedBracketId] = useState('')
  const [isSiteAdmin, setIsSiteAdmin] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [creatingPool, setCreatingPool] = useState(false)
  const [creatingGame, setCreatingGame] = useState(false)
  const [poolError, setPoolError] = useState<string | null>(null)
  const [gameError, setGameError] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    const [isSiteAdminResult, { data: gameData }, { data: bracketData }] = await Promise.all([
      getIsSiteAdmin(supabase),
      supabase
        .from('games')
        .select('id, slug, display_name, game_type, status, bracket_id, lock_deadline')
        .eq('status', 'active')
        .order('display_name', { ascending: true }),
      supabase
        .from('brackets')
        .select('id, slug, display_name, lock_deadline')
        .order('display_name', { ascending: true }),
    ])

    setIsSiteAdmin(isSiteAdminResult)
    setGames((gameData ?? []) as ManagedGame[])
    setBrackets((bracketData ?? []) as BracketOption[])

    if (!selectedBracketId && bracketData && bracketData.length > 0) {
      setSelectedBracketId(bracketData[0].id)
    }
  }, [router, selectedBracketId])

  useEffect(() => {
    let mounted = true

    async function boot() {
      setIsLoadingOptions(true)
      await loadOptions()
      if (mounted) {
        setIsLoadingOptions(false)
      }
    }

    void boot()

    return () => {
      mounted = false
    }
  }, [loadOptions])

  const bracketGames = useMemo(
    () => games.filter((game) => game.game_type === 'bracket'),
    [games]
  )

  const survivorGames = useMemo(
    () => games.filter((game) => game.game_type === 'nfl_survivor'),
    [games]
  )
  const availablePoolGames = poolType === 'bracket' ? bracketGames : survivorGames
  const effectiveSelectedGameId =
    availablePoolGames.some((game) => game.id === selectedGameId)
      ? selectedGameId
      : availablePoolGames[0]?.id ?? ''
  const selectedGame = useMemo(
    () =>
      games.find(
        (game) => game.id === effectiveSelectedGameId && game.game_type === poolType
      ) ?? null,
    [effectiveSelectedGameId, games, poolType]
  )
  const isTestMode = searchParams.get('mode') === 'test'

  async function handleCreatePool(e: React.FormEvent) {
    e.preventDefault()
    if (!poolName.trim() || !selectedGame) return

    setCreatingPool(true)
    setPoolError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({
        name: poolName.trim(),
        invite_code: generateInviteCode(),
        created_by: user.id,
      })
      .select('id')
      .single()

    if (groupErr || !group) {
      setPoolError(groupErr?.message ?? 'Failed to create pool.')
      setCreatingPool(false)
      return
    }

    const { error: memberErr } = await supabase
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: user.id,
        is_admin: true,
        has_paid: false,
      })

    if (memberErr) {
      setPoolError(memberErr.message)
      setCreatingPool(false)
      return
    }

    const { error: groupGameErr } = await supabase
      .from('group_games')
      .insert({ group_id: group.id, game_id: selectedGame.id })

    if (groupGameErr) {
      setPoolError(groupGameErr.message)
      setCreatingPool(false)
      return
    }

    router.push(`/dashboard/pool/${group.id}/contest/${selectedGame.slug}`)
  }

  async function handleCreateGame(e: React.FormEvent) {
    e.preventDefault()
    if (!isSiteAdmin) return

    const trimmedName = gameName.trim()
    const normalizedSlug = slugify(gameSlug || trimmedName)

    if (!trimmedName || !normalizedSlug) {
      setGameError('Game name and slug are required.')
      return
    }

    if (gameType === 'bracket' && !selectedBracketId) {
      setGameError('Choose a bracket template for bracket games.')
      return
    }

    setCreatingGame(true)
    setGameError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    const selectedBracket =
      gameType === 'bracket'
        ? brackets.find((bracket) => bracket.id === selectedBracketId) ?? null
        : null

    const { error: insertErr } = await supabase
      .from('games')
      .insert({
        slug: normalizedSlug,
        display_name: trimmedName,
        game_type: gameType,
        status: 'active',
        bracket_id: selectedBracket?.id ?? null,
        lock_deadline: selectedBracket?.lock_deadline ?? null,
        created_by: user.id,
      })

    if (insertErr) {
      setGameError(insertErr.message)
      setCreatingGame(false)
      return
    }

    setGameName('')
    setGameSlug('')
    setGameType('bracket')
    if (brackets.length > 0) {
      setSelectedBracketId(brackets[0].id)
    }
    await loadOptions()
    setCreatingGame(false)
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-8">
      <div>
        <h2
          className="text-2xl font-bold text-zinc-100"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Publish Games, Then Create Pools
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Step 1: publish an official game. Step 2: create a player pool for that game.
        </p>
      </div>

      {isSiteAdmin && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
              Step 1 · Site Admin
            </p>
            <h3 className="text-lg font-semibold text-zinc-100 mt-1">Create Official Game</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Publish the official bracket or survivor game once, then let everyone create their own pools from it.
            </p>
          </div>

          <form onSubmit={handleCreateGame} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="gameName"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Game Name
              </label>
              <input
                id="gameName"
                type="text"
                required
                value={gameName}
                onChange={(e) => {
                  setGameName(e.target.value)
                  setGameSlug((current) => current || slugify(e.target.value))
                }}
                placeholder="e.g. World Cup 2026 Official"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="gameSlug"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Game Slug
              </label>
              <input
                id="gameSlug"
                type="text"
                required
                value={gameSlug}
                onChange={(e) => setGameSlug(slugify(e.target.value))}
                placeholder="world-cup-2026-official"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="gameType"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Game Type
              </label>
              <select
                id="gameType"
                value={gameType}
                onChange={(e) => setGameType(e.target.value as 'bracket' | 'nfl_survivor')}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors appearance-none"
              >
                <option value="bracket">Bracket</option>
                <option value="nfl_survivor">NFL Survivor</option>
              </select>
            </div>

            {gameType === 'bracket' && (
              <div>
                <label
                  htmlFor="bracketTemplate"
                  className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
                >
                  Bracket Template
                </label>
                <select
                  id="bracketTemplate"
                  value={selectedBracketId}
                  onChange={(e) => setSelectedBracketId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors appearance-none"
                >
                  {brackets.map((bracket) => (
                    <option key={bracket.id} value={bracket.id}>
                      {bracket.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {gameError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                {gameError}
              </p>
            )}

            <button
              type="submit"
              disabled={creatingGame}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm py-3.5 transition-colors flex items-center justify-center gap-2"
            >
              {creatingGame ? 'Publishing…' : 'Publish Official Game'}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Step 2 · Player Setup
          </p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Create a Pool</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Choose the type of pool you want, then attach it to an official game that is already live.
          </p>
        </div>

        {isTestMode && (
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Test mode: create a throwaway pool so you can click through the app and learn the flow.
          </div>
        )}

        {isLoadingOptions ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center">
            <p className="text-sm text-zinc-300">No active games yet.</p>
            <p className="text-xs text-zinc-500 mt-2">
              {isSiteAdmin
                ? 'Create the first official game above.'
                : 'A site admin needs to publish a game before pools can be created.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreatePool} className="flex flex-col gap-5">
            <div>
              <p className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                Pool Type
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPoolType('bracket')}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    poolType === 'bracket'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  Create Bracket Pool
                </button>
                <button
                  type="button"
                  onClick={() => setPoolType('nfl_survivor')}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    poolType === 'nfl_survivor'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  Create Survivor Pool
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="poolName"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Pool Name
              </label>
              <input
                id="poolName"
                type="text"
                required
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                placeholder="e.g. Office Knockout Pool"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="game"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
              >
                Official {poolType === 'bracket' ? 'Bracket' : 'Survivor'} Game
              </label>
              {availablePoolGames.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-5 text-sm text-zinc-400">
                  No active {poolType === 'bracket' ? 'bracket' : 'survivor'} games are available yet.
                </div>
              ) : (
                <select
                  id="game"
                  value={effectiveSelectedGameId}
                  onChange={(e) => setSelectedGameId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors appearance-none"
                >
                  {availablePoolGames.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.display_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedGame && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm">
                <p className="text-zinc-200 font-medium">{selectedGame.display_name}</p>
                <p className="text-zinc-500 mt-1">
                  Type: {selectedGame.game_type === 'bracket' ? 'Bracket' : 'NFL Survivor'}
                </p>
                <p className="text-zinc-500 mt-1">
                  Lock: {formatDeadline(selectedGame.lock_deadline)}
                </p>
              </div>
            )}

            {poolError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                {poolError}
              </p>
            )}

            <button
              type="submit"
              disabled={creatingPool || !selectedGame}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm py-3.5 transition-colors flex items-center justify-center gap-2"
            >
              {creatingPool
                ? 'Creating…'
                : poolType === 'bracket'
                ? 'Create Bracket Pool'
                : 'Create Survivor Pool'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
