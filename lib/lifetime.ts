// Lifetime points for one group, from the same four sources the group
// page's board uses: settled bets, roster-pool champs, pick'em
// co-winners, quiz winners. Returns a Map keyed by user_id; members
// with no wins simply aren't in the map (callers default to 0).
export async function getGroupLifetime(
  supabase: any,
  groupId: string
): Promise<Map<string, { points: number; wins: number }>> {
  const pointsByUser = new Map<string, { points: number; wins: number }>();
  const add = (uid: string | null, pts: number) => {
    if (!uid) return;
    const cur = pointsByUser.get(uid) ?? { points: 0, wins: 0 };
    cur.points += pts;
    cur.wins += 1;
    pointsByUser.set(uid, cur);
  };

  const { data: settled } = await supabase
    .from("bets")
    .select("points, proposed_winner_id")
    .eq("group_id", groupId)
    .eq("status", "settled");
  for (const s of (settled ?? []) as any[]) add(s.proposed_winner_id, s.points);

  const { data: poolWinners } = await supabase
    .from("pools")
    .select("winner_user_id, winner_points")
    .eq("group_id", groupId)
    .not("winner_user_id", "is", null);
  for (const w of (poolWinners ?? []) as any[]) add(w.winner_user_id, w.winner_points);

  const { data: pickemWinners } = await supabase
    .from("pickem_pool_winners")
    .select("user_id, points, pickem_pools!inner(group_id)")
    .eq("pickem_pools.group_id", groupId);
  for (const w of (pickemWinners ?? []) as any[]) add(w.user_id, w.points);

  const { data: quizWinners } = await supabase
    .from("quiz_winners")
    .select("user_id, points, quizzes!inner(group_id)")
    .eq("quizzes.group_id", groupId);
  for (const w of (quizWinners ?? []) as any[]) add(w.user_id, w.points);

  return pointsByUser;
}
