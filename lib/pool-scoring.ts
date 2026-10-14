import { calcPoints, type ScoringFormula } from "./config";

// One place that turns a pool's stats into points per player. Used by the
// pool page leaderboard, /scoring, and the award-winner action.
//
// - Linked pools (pool_games): API stat lines from game_stat_lines across
//   the pool's linked games, matched on player name + team abbrev
//   (case-insensitive, trimmed — no silent zeros: unmatched players are
//   reported). A manual pool_stat_lines row for (player, game number N)
//   overrides the API line for the pool's Nth linked game by kickoff order.
// - Legacy pools (no linked games): manual pool_stat_lines only, as before.

export interface LinkedGame {
  id: string;
  label: string;
  starts_at: string | null;
  status: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
}

export interface PoolPoints {
  points: Map<string, number>; // pool_player.id -> points
  unmatched: string[]; // player names with no API match anywhere (linked pools)
  linkedGames: LinkedGame[];
}

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

export async function computePoolPoints(supabase: any, poolId: string): Promise<PoolPoints> {
  const { data: pool } = await supabase
    .from("pools")
    .select("id, scoring_formula")
    .eq("id", poolId)
    .single();
  const formula = ((pool?.scoring_formula ?? {}) as ScoringFormula);

  const { data: players } = await supabase
    .from("pool_players")
    .select("id, name, team")
    .eq("pool_id", poolId);
  const playerList = (players ?? []) as any[];

  const { data: links } = await supabase
    .from("pool_games")
    .select("game_id")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);

  const points = new Map<string, number>();

  // Legacy: no linked games — manual lines only, exactly as before.
  if (gameIds.length === 0) {
    const { data: lines } = await supabase
      .from("pool_stat_lines")
      .select("player_id, stats")
      .eq("pool_id", poolId);
    for (const s of (lines ?? []) as any[]) {
      const pts = calcPoints((s.stats ?? {}) as Record<string, number>, formula);
      points.set(s.player_id, (points.get(s.player_id) ?? 0) + pts);
    }
    return { points, unmatched: [], linkedGames: [] };
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, label, starts_at, status, home_team, away_team, home_score, away_score")
    .in("id", gameIds)
    .order("starts_at", { ascending: true });
  const linkedGames = ((games ?? []) as LinkedGame[]);

  const { data: apiLines } = await supabase
    .from("game_stat_lines")
    .select("game_id, player_name, team, stats")
    .in(
      "game_id",
      linkedGames.map((g) => g.id)
    );
  const apiByGame = new Map<string, any[]>();
  for (const l of (apiLines ?? []) as any[]) {
    const arr = apiByGame.get(l.game_id) ?? [];
    arr.push(l);
    apiByGame.set(l.game_id, arr);
  }

  const { data: manual } = await supabase
    .from("pool_stat_lines")
    .select("player_id, game_number, stats")
    .eq("pool_id", poolId);
  const manualByKey = new Map<string, any>();
  for (const m of (manual ?? []) as any[]) {
    manualByKey.set(`${m.player_id}|${m.game_number}`, m);
  }

  const unmatched: string[] = [];
  for (const p of playerList) {
    let total = 0;
    let matched = false;
    linkedGames.forEach((g, i) => {
      const override = manualByKey.get(`${p.id}|${i + 1}`);
      if (override) {
        total += calcPoints((override.stats ?? {}) as Record<string, number>, formula);
        matched = true;
        return;
      }
      const line = (apiByGame.get(g.id) ?? []).find(
        (l: any) => norm(l.player_name) === norm(p.name) && norm(l.team) === norm(p.team)
      );
      if (line) {
        total += calcPoints((line.stats ?? {}) as Record<string, number>, formula);
        matched = true;
      }
    });
    points.set(p.id, Math.round(total * 100) / 100);
    if (!matched) unmatched.push(p.name);
  }

  return { points, unmatched, linkedGames };
}
