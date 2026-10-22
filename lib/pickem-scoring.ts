// Pick'em scoring: one dispatcher per variant, so new game types plug in
// without touching the standard path. v1 ships 'standard' only; v2 adds
// 'over_under' (commish-set prop lines, feed-graded).
//
// - Linked games come from the games table (API-fed). The winner of a
//   final game is derived from home_score/away_score; a tie scores for
//   nobody.
// - Standard pools can also grade against the spread (use_spread): the
//   line frozen on pickem_pool_games at creation decides who covered —
//   never the live line on games, which keeps moving until kickoff.
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

// Against the spread: homeSpread is the HOME team's frozen number
// (negative = home favored). Home covers when home_score + spread beats
// the away score, away covers when it falls short; landing exactly on
// the number is a push — nobody scores, same as a tie above. A game
// whose line never posted (null snapshot) grades straight up instead.
function coveringTeam(g: PickemGame, homeSpread: number | null): string | null {
  if (g.status !== "final" || g.home_score == null || g.away_score == null) return null;
  if (homeSpread == null) return gameWinner(g);
  const home = String(g.home_team ?? "").toUpperCase();
  const away = String(g.away_team ?? "").toUpperCase();
  const adjusted = g.home_score + homeSpread;
  if (adjusted > g.away_score) return home;
  if (adjusted < g.away_score) return away;
  return null; // push: no point for anyone
}

export async function computePickemLeaderboard(
  supabase: any,
  poolId: string
): Promise<PickemRow[]> {
  const { data: pool } = await supabase
    .from("pickem_pools")
    .select("id, variant, use_spread")
    .eq("id", poolId)
    .single();
  if (!pool) throw new Error("Pool not found.");

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id, spread")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
  // Frozen per-pool lines, snapshotted at creation (migration 023). Post-
  // gREST hands numeric columns back as strings, so coerce defensively.
  const spreadByGame = new Map<string, number | null>(
    ((links ?? []) as any[]).map((l) => {
      const s = l.spread == null ? null : Number(l.spread);
      return [l.game_id, Number.isFinite(s as number) ? (s as number) : null] as [
        string,
        number | null,
      ];
    })
  );

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
      return pool.use_spread
        ? scoreStandard(gameList, pickList, spreadByGame)
        : scoreStandard(gameList, pickList);
    case "over_under":
      return scoreOverUnder(supabase, poolId, gameList);
    // Future variants plug in here: case "elimination": ..., etc.
    default:
      throw new Error(`The '${pool.variant}' variant isn't built yet.`);
  }
}

// v1: 1 point per correct pick. Only final games count. spreads is
// present only for against-the-spread pools (use_spread): the winner of
// each final game is then who COVERED the frozen line, not who won
// outright. Without it this is the original straight-up scorer, untouched.
function scoreStandard(
  games: PickemGame[],
  picks: any[],
  spreads?: Map<string, number | null>
): PickemRow[] {
  const ats = spreads != null;
  const winners = new Map<string, string | null>(
    games.map((g) => [
      g.id,
      ats ? coveringTeam(g, spreads.get(g.id) ?? null) : gameWinner(g),
    ])
  );
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

// Over/under props: the commish sets a line per (player, stat); 1 point
// per correct side. Actual = the player's stat summed across the pool's
// linked games, matched on name + team exactly like the roster pools.
// Over wins if actual > line, under if actual < line; a push scores for
// nobody (but still counts as decided, like a tied game in standard).
// A prop is decided only when every linked game is final — no partial
// credit mid-slate.
async function scoreOverUnder(
  supabase: any,
  poolId: string,
  games: PickemGame[]
): Promise<PickemRow[]> {
  const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

  const { data: lines } = await supabase
    .from("pickem_lines")
    .select("id, player_name, team, stat_key, line")
    .eq("pool_id", poolId);
  const lineList = (lines ?? []) as any[];
  const lineById = new Map<string, any>(lineList.map((l) => [l.id, l]));

  const { data: propPicks } = await supabase
    .from("pickem_prop_picks")
    .select("user_id, line_id, side, created_at, profiles(display_name)")
    .eq("pool_id", poolId);
  const pickList = (propPicks ?? []) as any[];

  const gameIds = games.map((g) => g.id);
  const { data: statLines } = gameIds.length
    ? await supabase
        .from("game_stat_lines")
        .select("player_name, team, stats")
        .in("game_id", gameIds)
    : { data: [] };

  // Actual per prop: sum the stat across every linked game.
  const actualByLine = new Map<string, number>();
  for (const l of lineList) {
    let actual = 0;
    const ln = norm(l.player_name);
    const lt = norm(l.team);
    for (const s of (statLines ?? []) as any[]) {
      if (norm(s.player_name) === ln && norm(s.team) === lt) {
        const v = Number(s.stats?.[l.stat_key]);
        if (Number.isFinite(v)) actual += v;
      }
    }
    actualByLine.set(l.id, actual);
  }

  const allFinal =
    gameIds.length > 0 && games.every((g) => g.status === "final");

  const byUser = new Map<string, any[]>();
  for (const p of pickList) {
    if (!lineById.has(p.line_id)) continue;
    const arr = byUser.get(p.user_id) ?? [];
    arr.push(p);
    byUser.set(p.user_id, arr);
  }

  const rows: PickemRow[] = [...byUser.entries()].map(([user_id, ps]) => {
    let correct = 0;
    let total = 0;
    for (const p of ps) {
      const line = lineById.get(p.line_id);
      if (!line || !allFinal) continue;
      total++;
      const actual = actualByLine.get(p.line_id) ?? 0;
      const lv = Number(line.line);
      if (p.side === "over" && actual > lv) correct++;
      else if (p.side === "under" && actual < lv) correct++;
      // push: decided, but nobody scores
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

  rows.sort(
    (a, b) => b.points - a.points || a.earliest_pick.localeCompare(b.earliest_pick)
  );
  return rows;
}
