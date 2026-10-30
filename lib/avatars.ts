// Fetch profile avatar choices for a set of users, keyed by user id.
// Tolerant by design: if the avatar_animal column isn't there yet
// (migration 026 not run), this returns an empty map and every board
// just falls back to initials — pages never break over a missing column.
export async function getAvatarMap(
  supabase: any,
  userIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, avatar_animal")
    .in("id", ids);
  if (error || !data) return map;
  for (const r of data as any[]) map.set(r.id, r.avatar_animal ?? null);
  return map;
}
