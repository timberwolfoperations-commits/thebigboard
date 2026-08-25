import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function sanitizeNextPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }

  return value
}

export default async function JoinByInvitePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>
}) {
  const { inviteCode } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${inviteCode}`)}`)
  }

  const { data: groupId, error } = await supabase.rpc('join_group_by_invite', {
    invite: inviteCode,
  })

  if (error || !groupId) {
    redirect('/dashboard')
  }

  const { data: groupGame } = await supabase
    .from('group_games')
    .select('game_id')
    .eq('group_id', groupId)
    .limit(1)
    .maybeSingle()

  const { data: game } = groupGame?.game_id
    ? await supabase
        .from('games')
        .select('slug')
        .eq('id', groupGame.game_id)
        .maybeSingle()
    : { data: null }

  const slug = game?.slug
  if (!slug) {
    redirect(sanitizeNextPath('/dashboard'))
  }

  redirect(sanitizeNextPath(`/dashboard/pool/${groupId}/contest/${slug}`))
}
