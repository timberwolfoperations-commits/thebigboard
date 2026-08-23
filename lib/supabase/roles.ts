import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

export async function getIsSiteAdmin(supabase: SupabaseClient<Database>): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('is_site_admin')

  if (error) {
    return false
  }

  return Boolean(data)
}
