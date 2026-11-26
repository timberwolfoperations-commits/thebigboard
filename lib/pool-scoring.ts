import { calcPoints, type ScoringFormula } from "./config";
import {
  isModifierCode,
  modifierBonus,
  wildcardCreditsForGame,
  wildcardKey,
  type ModifierCode,
} from "./modifiers";
import type { ScoringPlay } from "./nfl-sync";

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
  perGame: Map<string, number[]>; // pool_player.id -> points per linked game, kickoff order
  stats: Map<string, Record<string, number>>; // pool_player.id -> summed raw stats that scored those points
  unmatched: string[]; // player names with no API match anywhere (linked pools)
  linkedGames: LinkedGame[];
}

// Short labels for the raw stat keys, in the order they read on a
// scoring line. Unknown keys fall back to the key itself.
const STAT_LABELS: Record<string, string> = {
  PASS_YD: "pass yds",
  PASS_TD: "pass TD",
  INT: "INT",
  RUSH_YD: "rush yds",
  RUSH_TD: "rush TD",
  REC: "rec",
  REC_YD: "rec yds",
  REC_TD: "rec TD",
  FUM_LOST: "fum lost",
};

// The compact stat line under a player's points: only the stats that
// are nonzero, e.g. "245 pass yds · 2 pass TD · 1 INT". Empty when
// nothing has scored yet.
export function formatPlayerStatLine(stats: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const v = stats[key] ?? 0;
    if (v !== 0) parts.push(`${v} ${label}`);
  }
  for (const [key, v] of Object.entries(stats)) {
    if (!(key in STAT_LABELS) && v !== 0) parts.push(`${v} ${key}`);
  }
  return parts.join(" · ");
}

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

export async function computePoolPoints(supabase: any, poolId: string): Promise<PoolPoints> {
  // Pool, players, and game links all key off the pool id alone —
  // one parallel batch instead of three serial round trips.
  const [{ data: pool }, { data: players }, { data: links }] = await Promise.all([
    supabase.from("pools").select("id, scoring_formula").eq("id", poolId).single(),
    supabase.from("pool_players").select("id, name, team").eq("pool_id", poolId),
    supabase.from("pool_games").select("game_id").eq("pool_id", poolId),
  ]);
  const formula = ((pool?.scoring_formula ?? {}) as ScoringFormula);

  const playerList = (players ?? []) as any[];
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);

  const points = new Map<string, number>();
  const perGame = new Map<string, number[]>();
  const stats = new Map<string, Record<string, number>>();
  // Sum one stat record into a player's running totals (a player
  // scores in one game in practice, but the sum stays correct if a
  // name ever matches in two).
  const addStats = (playerId: string, rec: Record<string, number>) => {
    const cur = stats.get(playerId) ?? {};
    for (const [k, v] of Object.entries(rec)) {
      cur[k] = (cur[k] ?? 0) + (typeof v === "number" ? v : 0);
    }
    stats.set(playerId, cur);
  };

  // Legacy: no linked games — manual lines only, exactly as before.
  if (gameIds.length === 0) {
    const { data: lines } = await supabase
      .from("pool_stat_lines")
      .select("player_id, stats")
      .eq("pool_id", poolId);
    for (const s of (lines ?? []) as any[]) {
      const rec = (s.stats ?? {}) as Record<string, number>;
      const pts = calcPoints(rec, formula);
      points.set(s.player_id, (points.get(s.player_id) ?? 0) + pts);
      addStats(s.player_id, rec);
    }
    return { points, perGame, stats, unmatched: [], linkedGames: [] };
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
    const perGameArr: number[] = [];
    linkedGames.forEach((g, i) => {
      const override = manualByKey.get(`${p.id}|${i + 1}`);
      let pts = 0;
      if (override) {
        const rec = (override.stats ?? {}) as Record<string, number>;
        pts = calcPoints(rec, formula);
        addStats(p.id, rec);
        matched = true;
      } else {
        const line = (apiByGame.get(g.id) ?? []).find(
          (l: any) => norm(l.player_name) === norm(p.name) && norm(l.team) === norm(p.team)
        );
        if (line) {
          const rec = (line.stats ?? {}) as Record<string, number>;
          pts = calcPoints(rec, formula);
          addStats(p.id, rec);
          matched = true;
        }
      }
      perGameArr.push(Math.round(pts * 100) / 100);
      total += pts;
    });
    points.set(p.id, Math.round(total * 100) / 100);
    perGame.set(p.id, perGameArr);
    if (!matched) unmatched.push(p.name);
  }

  return { points, perGame, stats, unmatched, linkedGames };
}

// --- Entry standings with modifiers -----------------------------------------
// One place that turns a pool's entries into totals WITH the Final 5
// modifiers applied. The pool page leaderboard, the award-winner action,
// and the dashboard standing all read from here, so the number a player
// sees is the number that wins.
//
// Base points come from computePoolPoints (same as before). On top, each
// pick's modifier bonus is computed from:
//   - ownership n (entries that drafted the player) for DD and SOLO,
//   - the game's final result + the pick's base points for Winner's Circle,
//   - the game's stored scoring plays for the Wildcard.
// Per-game crowns use the modified (post-modifier) points for that slot.

export interface EntryPickScore {
  playerId: string;
  name: string;
  team: string;
  salary: number;
  gameNumber: number | null;
  base: number;
  modifier: ModifierCode | null;
  bonus: number;
  modified: number;
}

export interface EntryScore {
  entryId: string;
  userId: string;
  displayName: string;
  createdAt: string;
  picks: EntryPickScore[];
  baseTotal: number;
  bonusTotal: number;
  total: number; // modified total — the number that wins
  perGameModified: number[]; // modified points per linked game, kickoff order
}

export interface PlayerScore {
  playerId: string;
  name: string;
  team: string;
  salary: number;
  gameNumber: number | null;
  points: number; // base fantasy points from the pool's formula
  stats: Record<string, number>; // the raw stats that scored those points
}

export interface EntryScores {
  entries: EntryScore[]; // sorted by total desc, then earliest entry first
  linkedGames: LinkedGame[];
  unmatched: string[];
  hasModifiers: boolean; // any entry carries a modifier
  playerScores: PlayerScore[]; // every player in the pool, points desc — the scoring table
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computeEntryScores(supabase: any, poolId: string): Promise<EntryScores> {
  const { points, stats, unmatched, linkedGames } = await computePoolPoints(supabase, poolId);

  const [{ data: players }, { data: entries }, { data: picks }] = await Promise.all([
    supabase
      .from("pool_players")
      .select("id, name, team, salary, game_number")
      .eq("pool_id", poolId),
    supabase
      .from("pool_entries")
      .select("id, user_id, created_at, profiles(display_name)")
      .eq("pool_id", poolId),
    // pool_entry_picks has no pool_id — filter through the entry join.
    supabase
      .from("pool_entry_picks")
      .select("entry_id, player_id, modifier, pool_entries!inner(pool_id)")
      .eq("pool_entries.pool_id", poolId),
  ]);
  const entryList = (entries ?? []) as any[];
  const pickRows = (picks ?? []) as any[];

  const playerList = (players ?? []) as any[];
  const playerById = new Map(playerList.map((p) => [p.id, p]));

  // Ownership n per player: entries that drafted him, regardless of modifier.
  const ownership = new Map<string, number>();
  for (const pk of pickRows as any[]) {
    ownership.set(pk.player_id, (ownership.get(pk.player_id) ?? 0) + 1);
  }

  // Wildcard credits per linked game, from the stored scoring plays.
  const wildcardByGame = new Map<string, Set<string>>();
  if (linkedGames.length > 0) {
    const { data: playRows } = await supabase
      .from("game_scoring_plays")
      .select("game_id, play_id, seq, team, type_text, text, yardage, scorer_name, passer_name, away_score, home_score, period, clock_seconds")
      .in(
        "game_id",
        linkedGames.map((g) => g.id)
      )
      .order("seq", { ascending: true });
    const playsByGame = new Map<string, ScoringPlay[]>();
    for (const r of (playRows ?? []) as any[]) {
      const arr = playsByGame.get(r.game_id) ?? [];
      arr.push(r as ScoringPlay);
      playsByGame.set(r.game_id, arr);
    }
    for (const g of linkedGames) {
      wildcardByGame.set(
        g.id,
        wildcardCreditsForGame(playsByGame.get(g.id) ?? [], {
          status: g.status,
          home_team: g.home_team,
          away_team: g.away_team,
        })
      );
    }
  }

  const picksByEntry = new Map<string, any[]>();
  for (const pk of pickRows as any[]) {
    const arr = picksByEntry.get(pk.entry_id) ?? [];
    arr.push(pk);
    picksByEntry.set(pk.entry_id, arr);
  }

  const hasModifiers = (pickRows as any[]).some((pk) => pk.modifier != null);

  const entriesOut: EntryScore[] = entryList.map((e: any) => {
    const entryPicks = picksByEntry.get(e.id) ?? [];
    const perGameModified: number[] = linkedGames.map(() => 0);
    let baseTotal = 0;
    let bonusTotal = 0;
    const scored: EntryPickScore[] = entryPicks.map((pk: any) => {
      const p = playerById.get(pk.player_id);
      const base = round2(points.get(pk.player_id) ?? 0);
      const modifier: ModifierCode | null = isModifierCode(pk.modifier) ? pk.modifier.toUpperCase() as ModifierCode : null;
      // The pick's game, by its game slot (kickoff order = linked-game order).
      const gameIdx =
        p?.game_number != null ? Number(p.game_number) - 1 : -1;
      const game = gameIdx >= 0 && gameIdx < linkedGames.length ? linkedGames[gameIdx] : null;
      let teamWon: boolean | null = null;
      if (game && game.status === "final" && p) {
        const team = String(p.team ?? "").toUpperCase();
        if (team === String(game.home_team ?? "").toUpperCase()) {
          teamWon = (game.home_score ?? 0) > (game.away_score ?? 0);
        } else if (team === String(game.away_team ?? "").toUpperCase()) {
          teamWon = (game.away_score ?? 0) > (game.home_score ?? 0);
        }
        if ((game.home_score ?? 0) === (game.away_score ?? 0)) teamWon = null;
      }
      const wildcardCredit =
        game != null && p != null
          ? (wildcardByGame.get(game.id) ?? new Set()).has(wildcardKey(p.team, p.name))
          : false;
      const bonus = modifierBonus({
        base,
        modifier,
        ownership: ownership.get(pk.player_id) ?? 0,
        teamWon,
        wildcardCredit,
      });
      const modified = round2(base + bonus);
      if (gameIdx >= 0 && gameIdx < perGameModified.length) {
        perGameModified[gameIdx] = round2(perGameModified[gameIdx] + modified);
      }
      baseTotal = round2(baseTotal + base);
      bonusTotal = round2(bonusTotal + bonus);
      return {
        playerId: pk.player_id,
        name: p?.name ?? "Player",
        team: p?.team ?? "",
        salary: p?.salary ?? 0,
        gameNumber: p?.game_number ?? null,
        base,
        modifier,
        bonus,
        modified,
      };
    });
    return {
      entryId: e.id,
      userId: e.user_id,
      displayName: e.profiles?.display_name ?? "Player",
      createdAt: e.created_at,
      picks: scored,
      baseTotal,
      bonusTotal,
      total: round2(baseTotal + bonusTotal),
      perGameModified,
    };
  });

  entriesOut.sort(
    (a, b) => b.total - a.total || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // The scoring table: every player in the pool with the base points
  // the formula gives them and the raw stats behind it — drafted or
  // not, so the whole pool can see who is actually scoring. Best
  // first; ties break to the higher salary, then the alphabet.
  const playerScores: PlayerScore[] = playerList
    .map((p: any) => ({
      playerId: p.id as string,
      name: p.name as string,
      team: p.team as string,
      salary: (p.salary ?? 0) as number,
      gameNumber: (p.game_number ?? null) as number | null,
      points: round2(points.get(p.id) ?? 0),
      stats: stats.get(p.id) ?? {},
    }))
    .sort(
      (a, b) =>
        b.points - a.points || b.salary - a.salary || a.name.localeCompare(b.name)
    );

  return { entries: entriesOut, linkedGames, unmatched, hasModifiers, playerScores };
}
