// Pick'em scoring: one dispatcher per variant, so new game types plug in
// without touching the standard path. v1 ships 'standard' only; v2 adds
// 'over_under' (commish-set prop lines, feed-graded).
//
// - Linked games come from the games table (API-fed). The winner of a
//   final game is derived from home_score/away_score; a tie scores for
//   nobody.
// - Standard pools can also grade against the spread (use_spread): the
//   line frozen on pickem_pool_games decides who covered. Grading reads
//   only that snapshot, never the live line on games. Football pools
//   freeze the snapshot once at creation; the CBB sync refreshes it
//   from the live line until each game tips off (closing-line behavior,
//   lib/cbb-sync.ts) — either way the snapshot is the only input.
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

// Top 5 Confidence: every player picks exactly 5 games and ranks them
// 5 (most confident) down to 1, each rank used once. Shared by the
// scorer, the pick action's validation, and the missing-picks push
// (a full confidence card is 5 picks, not one per game).
export const CONFIDENCE_PICK_COUNT = 5;

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
  // Pool row, game links, and picks all key off the pool id alone —
  // one parallel batch; games still wait on the link ids.
  const [{ data: pool }, { data: links }, { data: picks }] = await Promise.all([
    supabase.from("pickem_pools").select("id, variant, use_spread").eq("id", poolId).single(),
    supabase.from("pickem_pool_games").select("game_id, spread").eq("pool_id", poolId),
    supabase
      .from("pickem_picks")
      .select("user_id, game_id, picked_team, confidence, created_at, profiles(display_name)")
      .eq("pool_id", poolId),
  ]);
  if (!pool) throw new Error("Pool not found.");
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
  // Frozen per-pool lines, snapshotted at creation (migration 023). The
  // API hands numeric columns back as strings sometimes, so coerce.
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

  const gameList = (games ?? []) as PickemGame[];
  const pickList = (picks ?? []) as any[];

  switch (pool.variant) {
    case "standard":
      return pool.use_spread
        ? scoreStandard(gameList, pickList, spreadByGame)
        : scoreStandard(gameList, pickList);
    case "confidence":
      return pool.use_spread
        ? scoreConfidence(gameList, pickList, spreadByGame)
        : scoreConfidence(gameList, pickList);
    case "over_under":
      return scoreOverUnder(supabase, poolId, gameList);
    // Future variants plug in here: case "elimination": ..., etc.
    default:
      throw new Error(`The '${pool.variant}' variant isn't built yet.`);
  }
}

export interface PickemPickOutcome {
  user_id: string;
  starts_at: string | null;
  correct: boolean;
}

// Per-pick outcomes for a pool: one entry per pick on a FINAL game
// (decided picks only), unordered — callers sort by starts_at. This is
// the raw material for streak / last-5 display stats; the leaderboard
// above stays the authority for totals, and both grade with the same
// winner functions so they can never disagree. Over/under pools grade
// props rather than games and return no outcomes.
export async function computePickemPickOutcomes(
  supabase: any,
  poolId: string
): Promise<PickemPickOutcome[]> {
  const [{ data: pool }, { data: links }, { data: picks }] = await Promise.all([
    supabase.from("pickem_pools").select("id, variant, use_spread").eq("id", poolId).single(),
    supabase.from("pickem_pool_games").select("game_id, spread").eq("pool_id", poolId),
    supabase
      .from("pickem_picks")
      .select("user_id, game_id, picked_team")
      .eq("pool_id", poolId),
  ]);
  if (!pool) throw new Error("Pool not found.");
  // Confidence grades per game exactly like standard — one winner per
  // final game, spread-aware when the pool is ATS — so streak / last-5
  // outcomes work for confidence pools too. Over/under props grade
  // differently and still return no outcomes.
  if (pool.variant !== "standard" && pool.variant !== "confidence") return [];

  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
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
  const gameById = new Map(((games ?? []) as PickemGame[]).map((g) => [g.id, g]));

  const outcomes: PickemPickOutcome[] = [];
  for (const p of (picks ?? []) as any[]) {
    const g = gameById.get(p.game_id);
    if (!g || g.status !== "final") continue;
    const w = pool.use_spread
      ? coveringTeam(g, spreadByGame.get(g.id) ?? null)
      : gameWinner(g);
    outcomes.push({
      user_id: p.user_id,
      starts_at: g.starts_at,
      correct: !!w && String(p.picked_team ?? "").toUpperCase() === w,
    });
  }
  return outcomes;
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

// Confidence: same winner logic as standard (straight-up, or who
// covered the frozen line when spreads are present — push and tie
// still score for nobody), but a correct pick pays its rank (5 down
// to 1) instead of 1 point. `correct` keeps counting correct picks —
// the leaderboard's small "3/5", the rating's accuracy feed, and the
// season's W/L all read it — while `points` is the weighted total
// the board sorts and awards on. A pick with no rank stored (never
// happens through the pick action, which always assigns one) scores
// 1, so a bad row can't zero a player's week.
// Exported for tests: the dispatcher above is the only production caller.
export function scoreConfidence(
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
    let points = 0;
    for (const p of ps) {
      if (!decided.has(p.game_id)) continue;
      total++;
      const w = winners.get(p.game_id);
      if (w && String(p.picked_team ?? "").toUpperCase() === w) {
        correct++;
        const rank = Number(p.confidence);
        points += Number.isFinite(rank) && rank >= 1 && rank <= 5 ? rank : 1;
      }
    }
    return {
      user_id,
      display_name: ps[0]?.profiles?.display_name ?? "Player",
      correct,
      total_decided: total,
      points,
      earliest_pick: ps.reduce(
        (min: string, p: any) => (p.created_at < min ? p.created_at : min),
        ps[0]?.created_at ?? ""
      ),
    };
  });

  // Same tiebreak as standard: most points, then earliest picks in.
  // The award step still crowns everyone tied at the top as co-winners.
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

  // Lines and prop picks both key off the pool id alone — one batch.
  const [{ data: lines }, { data: propPicks }] = await Promise.all([
    supabase
      .from("pickem_lines")
      .select("id, player_name, team, stat_key, line")
      .eq("pool_id", poolId),
    supabase
      .from("pickem_prop_picks")
      .select("user_id, line_id, side, created_at, profiles(display_name)")
      .eq("pool_id", poolId),
  ]);
  const lineList = (lines ?? []) as any[];
  const lineById = new Map<string, any>(lineList.map((l) => [l.id, l]));

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
