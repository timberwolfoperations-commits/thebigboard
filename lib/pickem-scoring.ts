// Pick'em scoring: one dispatcher per variant, so new game types plug in
// without touching the standard path. v1 ships 'standard' only.
//
// - Linked games come from the games table (API-fed). The winner of a
//   final game is derived from home_score/away_score; a tie scores for
//   nobody.
// - Picks are public to the group (like roster entries) — trash talk
//   requires knowing who took the Bills.

export interface PickemGame {
  id: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  starts_at: string | null;
}

export interface PickemRow {
  user_id: string;
  display_name: string;
  correct: number;
  total_decided: number;
  points: number;
  earliest_pick: string;
}

function gameWinner(g: PickemGame): string | null {
  if (g.status !== "final" || g.home_score == null || g.away_score == null) return null;
  const home = String(g.home_team ?? "").toUpperCase();
  const away = String(g.away_team ?? "").toUpperCase();
  if (g.home_score > g.away_score) return home;
  if (g.away_score > g.home_score) return away;
  return null; // tie: no point for anyone
}

export async function computePickemLeaderboard(
  supabase: any,
  poolId: string
): Promise<PickemRow[]> {
  const { data: pool } = await supabase
    .from("pickem_pools")
    .select("id, variant")
    .eq("id", poolId)
    .single();
  if (!pool) throw new Error("Pool not found.");

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);

  const { data: games } = gameIds.length
    ? await supabase
        .from("games")
        .select("id, home_team, away_team, home_score, away_score, status, starts_at")
        .in("id", gameIds)
    : { data: [] };

  const { data: picks } = await supabase
    .from("pickem_picks")
    .select("user_id, game_id, picked_team, created_at, profiles(display_name)")
    .eq("pool_id", poolId);

  const gameList = (games ?? []) as PickemGame[];
  const pickList = (picks ?? []) as any[];

  switch (pool.variant) {
    case "standard":
      return scoreStandard(gameList, pickList);
    // Future variants plug in here: case "elimination": ..., etc.
    default:
      throw new Error(`The '${pool.variant}' variant isn't built yet.`);
  }
}

// v1: 1 point per correct pick. Only final games count.
function scoreStandard(games: PickemGame[], picks: any[]): PickemRow[] {
  const winners = new Map<string, string | null>(games.map((g) => [g.id, gameWinner(g)]));
  const decided = new Set(games.filter((g) => g.status === "final").map((g) => g.id));

  const byUser = new Map<string, any[]>();
  for (const p of picks) {
    const arr = byUser.get(p.user_id) ?? [];
    arr.push(p);
    byUser.set(p.user_id, arr);
  }

  const rows: PickemRow[] = [...byUser.entries()].map(([user_id, ps]) => {
    let correct = 0;
    let total = 0;
    for (const p of ps) {
      if (!decided.has(p.game_id)) continue;
      total++;
      const w = winners.get(p.game_id);
      if (w && String(p.picked_team ?? "").toUpperCase() === w) correct++;
    }
    return {
      user_id,
      display_name: ps[0]?.profiles?.display_name ?? "Player",
      correct,
      total_decided: total,
      points: correct,
      earliest_pick: ps.reduce(
        (min: string, p: any) => (p.created_at < min ? p.created_at : min),
        ps[0]?.created_at ?? ""
      ),
    };
  });

  // Ties break to whoever got their picks in first — same spirit as the
  // roster pools breaking to the earliest entry.
  rows.sort(
    (a, b) => b.points - a.points || a.earliest_pick.localeCompare(b.earliest_pick)
  );
  return rows;
}
