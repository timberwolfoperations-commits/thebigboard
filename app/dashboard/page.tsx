import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface PoolRow {
  membershipId: string
  groupId: string
  groupName: string
  bracketSlug: string
  contestName: string
  lockDeadline: string | null
}

function formatDeadline(iso: string | null): string {
  if (!iso) return 'Open'
  const d = new Date(iso)
  return `Closes ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function isPastDeadline(iso: string | null): boolean {
  if (!iso) return false
  return new Date() > new Date(iso)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let pools: PoolRow[] = []

  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('group_memberships')
      .select(`
        id,
        group_id,
        groups (
          id,
          name,
          group_bracket_contests (
            bracket_id,
            brackets (
              slug,
              display_name,
              lock_deadline
            )
          )
        )
      `)
      .eq('user_id', user.id)

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pools = (data as any[]).flatMap((membership: any) => {
        const group = membership.groups
        if (!group) return []

        return group.group_bracket_contests.map((contest: any) => ({
          membershipId: membership.id,
          groupId: group.id,
          groupName: group.name,
          bracketSlug: contest.brackets.slug,
          contestName: contest.brackets.display_name,
          lockDeadline: contest.brackets.lock_deadline,
        }))
      })
    }
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      {/* Section header */}
      <div className="px-4 pt-6 pb-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Active Pools
        </span>
      </div>

      {/* Pool list */}
      <div className="flex flex-col divide-y divide-zinc-800/60">
        {pools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-800/60 flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-500"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <p className="text-zinc-400 font-medium text-sm mb-1">No active pools</p>
            <p className="text-zinc-600 text-xs max-w-xs">
              Create a pool or ask a friend for an invite code to get started.
            </p>
            <Link
              href="/dashboard/create-group"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm px-5 py-2.5 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create a Pool
            </Link>
          </div>
        ) : (
          pools.map((pool) => {
            const past = isPastDeadline(pool.lockDeadline)
            const deadline = formatDeadline(pool.lockDeadline)
            return (
              <Link
                key={pool.membershipId}
                href={`/dashboard/pool/${pool.groupId}/contest/${pool.bracketSlug}`}
                className="flex items-center gap-3 px-4 py-4 hover:bg-zinc-900/60 transition-colors active:bg-zinc-800/60"
              >
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">
                    {pool.groupName}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {pool.contestName}
                  </p>
                </div>

                {/* Badge */}
                <div className="shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
                      past
                        ? 'bg-zinc-700/40 text-zinc-500'
                        : 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                    }`}
                  >
                    {past ? 'Locked' : deadline}
                  </span>
                </div>

                {/* Chevron */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-600 shrink-0"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            )
          })
        )}
      </div>

      {/* Easter egg */}
      <div className="mt-auto pt-16 pb-6 text-center">
        <p className="text-[11px] text-zinc-700 tracking-wide select-none">
          Duggan Blows
        </p>
      </div>
    </div>
  )
}
