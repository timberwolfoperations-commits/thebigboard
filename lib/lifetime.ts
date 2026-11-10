// Lifetime points for one group, from the same five sources the group
// page's board uses: settled bets, roster-pool champs, pick'em
// co-winners, quiz winners, poker winners. Returns a Map keyed by
// user_id; members with no wins simply aren't in the map (callers
// default to 0).
//
// ONE SCOPE RULE (Michael, 2026-11-10): pick'em winners of a pool that
// belongs to a SEASON (a row in pickem_season_rounds) do NOT count
// here. Season weekly wins are season-internal — they decide the
// champion on the season page (which reads pickem_pool_winners itself)
// and group points land when a contest ends, not week to week. The
// winners rows themselves are untouched; this is a read-scope rule in
// this shared computation only, so every surface that shows lifetime
// points (group board, pool pages) agrees. lib/rating.ts is a separate
// computation with its own queries and deliberately still counts
// season titles exactly as before — do not "fix" it to match.

export interface LifetimeSources {
  settledBets: { proposed_winner_id: string | null; points: number }[];
  poolWinners: { winner_user_id: string | null; winner_points: number }[];
  pickemWinners: { pool_id: string; user_id: string; points: number }[];
  quizWinners: { user_id: string; points: number }[];
  pokerWinners: { user_id: string; points: number }[];
  seasonPoolIds: ReadonlySet<string>;
}

// Pure merge of the five winner sources into the lifetime map — split
// out of getGroupLifetime so the scope rule is testable without a DB.
export function tallyLifetimeSources(
  sources: LifetimeSources
): Map<string, { points: number; wins: number }> {
  const pointsByUser = new Map<string, { points: number; wins: number }>();
  const add = (uid: string | null, pts: number) => {
    if (!uid) return;
    const cur = pointsByUser.get(uid) ?? { points: 0, wins: 0 };
    cur.points += pts;
    cur.wins += 1;
    pointsByUser.set(uid, cur);
  };

  for (const s of sources.settledBets) add(s.proposed_winner_id, s.points);
  for (const w of sources.poolWinners) add(w.winner_user_id, w.winner_points);
  for (const w of sources.pickemWinners) {
    // Season-internal weekly win: the season page counts it, the
    // group lifetime board does not.
    if (sources.seasonPoolIds.has(w.pool_id)) continue;
    add(w.user_id, w.points);
  }
  for (const w of sources.quizWinners) add(w.user_id, w.points);
  for (const w of sources.pokerWinners) add(w.user_id, w.points);

  return pointsByUser;
}

export async function getGroupLifetime(
  supabase: any,
  groupId: string
): Promise<Map<string, { points: number; wins: number }>> {
  // The five sources are independent — one parallel batch instead of
  // five serial round trips. Results are still merged in the same
  // source order in tallyLifetimeSources, so totals are unchanged.
  // The sixth read is the season linkage for this group (pool ids that
  // are season rounds); if migration 029 hasn't run it simply comes
  // back empty and every pick'em win counts, as before.
  const [
    { data: settled },
    { data: poolWinners },
    { data: pickemWinners },
    { data: quizWinners },
    { data: pokerWinners },
    { data: seasonRounds },
  ] = await Promise.all([
    supabase
      .from("bets")
      .select("points, proposed_winner_id")
      .eq("group_id", groupId)
      .eq("status", "settled"),
    supabase
      .from("pools")
      .select("winner_user_id, winner_points")
      .eq("group_id", groupId)
      .not("winner_user_id", "is", null),
    supabase
      .from("pickem_pool_winners")
      .select("pool_id, user_id, points, pickem_pools!inner(group_id)")
      .eq("pickem_pools.group_id", groupId),
    supabase
      .from("quiz_winners")
      .select("user_id, points, quizzes!inner(group_id)")
      .eq("quizzes.group_id", groupId),
    supabase
      .from("poker_winners")
      .select("user_id, points, poker_tables!inner(group_id)")
      .eq("poker_tables.group_id", groupId),
    supabase
      .from("pickem_season_rounds")
      .select("pool_id, pickem_seasons!inner(group_id)")
      .eq("pickem_seasons.group_id", groupId),
  ]);

  return tallyLifetimeSources({
    settledBets: (settled ?? []) as LifetimeSources["settledBets"],
    poolWinners: (poolWinners ?? []) as LifetimeSources["poolWinners"],
    pickemWinners: (pickemWinners ?? []) as LifetimeSources["pickemWinners"],
    quizWinners: (quizWinners ?? []) as LifetimeSources["quizWinners"],
    pokerWinners: (pokerWinners ?? []) as LifetimeSources["pokerWinners"],
    seasonPoolIds: new Set(
      ((seasonRounds ?? []) as any[]).map((r) => r.pool_id as string)
    ),
  });
}
