'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface JoinPoolResult {
  group_id: string
  group_name: string
  game_slug: string | null
}

export default function JoinPoolPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setJoining(true)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: joinError } = await (supabase as any).rpc('join_group_by_invite', {
      invite_code_input: inviteCode.trim().toUpperCase(),
    })

    if (joinError) {
      setError(joinError.message)
      setJoining(false)
      return
    }

    const result = (data?.[0] ?? data) as JoinPoolResult | null

    if (!result?.group_id) {
      setError('Invite code not found.')
      setJoining(false)
      return
    }

    if (result.game_slug) {
      router.push(`/dashboard/pool/${result.group_id}/contest/${result.game_slug}`)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="px-4 py-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Join a Pool
          </p>
          <h2
            className="text-2xl font-bold text-zinc-100 mt-1"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Enter an Invite Code
          </h2>
          <p className="text-sm text-zinc-500 mt-2">
            Ask the pool owner for their invite code, then paste it here to join instantly.
          </p>
        </div>

        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="inviteCode"
              className="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2"
            >
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="text"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm uppercase tracking-[0.3em] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm py-3.5 transition-colors"
          >
            {joining ? 'Joining…' : 'Join Pool'}
          </button>
        </form>
      </section>
    </div>
  )
}
