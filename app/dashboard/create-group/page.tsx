'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function CreateGroupPage() {
  const router = useRouter()
  const [poolName, setPoolName] = useState('')
  const [bracketSlug, setBracketSlug] = useState('world-cup-2026')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!poolName.trim()) return

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    // 1. Fetch bracket id from slug
    const { data: bracket, error: bracketErr } = await supabase
      .from('brackets')
      .select('id')
      .eq('slug', bracketSlug)
      .single()

    if (bracketErr || !bracket) {
      setError('Tournament template not found. Make sure the database is seeded.')
      setLoading(false)
      return
    }

    // 2. Create group
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
      setError(groupErr?.message ?? 'Failed to create pool.')
      setLoading(false)
      return
    }

    // 3. Link group to bracket
    const { error: contestErr } = await supabase
      .from('group_bracket_contests')
      .insert({ group_id: group.id, bracket_id: bracket.id })

    if (contestErr) {
      setError(contestErr.message)
      setLoading(false)
      return
    }

    // 4. Add creator as admin member
    const { error: memberErr } = await supabase
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: user.id,
        is_admin: true,
        has_paid: false,
      })

    if (memberErr) {
      setError(memberErr.message)
      setLoading(false)
      return
    }

    router.push(`/dashboard/pool/${group.id}/contest/${bracketSlug}`)
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2
          className="text-2xl font-bold text-zinc-100"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Create a Pool
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Set up your bracket pool and invite friends.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Pool Name */}
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
            placeholder="e.g. Mike's Neighborhood Pool"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
          />
        </div>

        {/* Tournament */}
        <div>
          <label
            htmlFor="tournament"
            className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
          >
            Tournament
          </label>
          <select
            id="tournament"
            value={bracketSlug}
            onChange={(e) => setBracketSlug(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors appearance-none"
          >
            <option value="world-cup-2026">World Cup 2026 Knockout</option>
          </select>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm py-3.5 transition-colors flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
              Creating…
            </>
          ) : (
            'Create Pool'
          )}
        </button>
      </form>
    </div>
  )
}
