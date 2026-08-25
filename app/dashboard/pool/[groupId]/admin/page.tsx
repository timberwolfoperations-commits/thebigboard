'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PoolInviteCard from '@/components/PoolInviteCard'

interface MemberRow {
  membershipId: string
  userId: string
  displayName: string
  hasPaid: boolean
}

export default function PoolAdminPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.groupId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isSiteAdmin, setIsSiteAdmin] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    const [{ data: membership }, { data: siteAdmin }] = await Promise.all([
      supabase
        .from('group_memberships')
        .select('is_admin')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('site_admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const hasPoolAdminRole = Boolean(membership?.is_admin)
    const hasSiteAdminRole = Boolean(siteAdmin)
    setIsSiteAdmin(hasSiteAdminRole)

    if (!hasPoolAdminRole && !hasSiteAdminRole) {
      setError('Access denied. You are not assigned to this pool admin page.')
      setLoading(false)
      return
    }

    const [{ data: groupData }, { data: memberData }] = await Promise.all([
      supabase
        .from('groups')
        .select('name, invite_code')
        .eq('id', groupId)
        .maybeSingle(),
      supabase
        .from('group_memberships')
        .select('id, user_id, has_paid')
        .eq('group_id', groupId),
    ])

    if (groupData) {
      setGroupName(groupData.name)
      setInviteCode(groupData.invite_code)
    }

    setMembers(
      (memberData ?? []).map((member) => ({
        membershipId: member.id,
        userId: member.user_id,
        displayName: member.user_id === user.id ? (user.email ?? 'You') : `Player ${member.user_id.slice(0, 6)}`,
        hasPaid: member.has_paid,
      }))
    )

    setError(null)
    setLoading(false)
  }, [groupId, router])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function togglePayment(membershipId: string, currentStatus: boolean) {
    setTogglingId(membershipId)
    setMembers((prev) => prev.map((member) => (
      member.membershipId === membershipId ? { ...member, hasPaid: !currentStatus } : member
    )))

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('group_memberships')
      .update({ has_paid: !currentStatus })
      .eq('id', membershipId)

    if (updateErr) {
      setMembers((prev) => prev.map((member) => (
        member.membershipId === membershipId ? { ...member, hasPaid: currentStatus } : member
      )))
      setError(updateErr.message)
    } else {
      setError(null)
    }

    setTogglingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
      </div>
    )
  }

  if (error && members.length === 0) {
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
        <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">Pool Admin</p>
        <h1
          className="text-xl font-bold text-zinc-100 mt-1"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {groupName || 'Pool Control Panel'}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Manage pool payments and share the invite link. Official game results now live in the global game admin.
        </p>
        {isSiteAdmin && (
          <div className="mt-3">
            <Link
              href="/dashboard/admin"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-400 ring-1 ring-amber-500/30"
            >
              Open Game Admin
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="px-4 pt-4">
        {inviteCode && (
          <PoolInviteCard groupName={groupName || 'This pool'} inviteCode={inviteCode} />
        )}
      </div>

      <div className="mt-4">
        <div className="px-4 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Payment Ledger
          </p>
        </div>

        <div className="flex flex-col divide-y divide-zinc-800/60">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Member</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Status</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Toggle</span>
          </div>

          {members.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-zinc-500 text-sm">No members in this pool yet.</p>
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.membershipId}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{member.displayName}</p>
                  <p className="text-[11px] text-zinc-600 font-mono mt-0.5">{member.userId.slice(0, 8)}…</p>
                </div>

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

                <button
                  type="button"
                  onClick={() => void togglePayment(member.membershipId, member.hasPaid)}
                  disabled={togglingId === member.membershipId}
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
      </div>
    </div>
  )
}
