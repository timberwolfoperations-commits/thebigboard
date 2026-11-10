// Pick'em seasons: a season is a shell over ordinary weekly pick'em
// pools (migration 029). Rounds 1..N link to pick'em pools; standings
// are DERIVED at read from those pools — per-round leaderboards from
// lib/pickem-scoring plus the pickem_pool_winners rows that already
// bank group points. Nothing is materialized, no picks or points ever
// move, and a round counts as closed only when every one of its games
// is final (derived from the games table via the leaderboard's
// decided counts and the round game states below) — never merely
// because a winners row exists.

import { computePickemLeaderboard, type PickemRow } from "@/lib/pickem-scoring";

export interface SeasonRow {
  id: string;
  group_id: string;
  name: string;
  rounds_total: number;
  created_by: string;
  created_at: string;
}

export interface SeasonRoundPool {
  id: string;
  name: string;
  week: number | null;
  season: number | null;
  lock_at: string;
  scratched: boolean;
  variant: string;
}

export interface SeasonRound {
  season_id: string;
  round_no: number;
  pool_id: string;
  pool: SeasonRoundPool;
}

export interface Season {
  season: SeasonRow;
  rounds: SeasonRound[]; // linked rounds only, ascending by round_no
}

// One player's line in one round. null in a standing's perRound map
// means the player did not pick in that round at all.
export interface RoundCell {
  correct: number;
  decided: number; // picks on final games
  picksMade: number;
  won: boolean; // has a pickem_pool_winners row for that round
}

export interface SeasonStanding {
  user_id: string;
  display_name: string;
  correct: number;
  decided: number;
  missed: number; // decided - correct
  picksMade: number;
  weeklyWins: number;
  pointsBanked: number; // group points from THIS season's winners rows
  perRound: Map<number, RoundCell | null>; // key: round_no
}

// ---------------------------------------------------------- pure part

export interface RoundBoardInput {
  roundNo: number;
  poolId: string;
  board: PickemRow[]; // one round's computePickemLeaderboard rows
  picksMade: Map<string, number>; // user_id -> picks made in this round
}

export interface SeasonWinnerInput {
  poolId: string;
  userId: string;
  points: number;
}

export interface SeasonMemberInput {
  userId: string;
  displayName: string;
}

// Fold per-round leaderboards + winners rows into season standings.
// `members` seeds the roster so a group member who has never picked
// still appears at 0-0 (the honest bottom of the board). Ordering:
// total correct desc, weekly wins desc, name asc — the race is about
// picking games right; wins break the tie before the alphabet does.
export function aggregateSeasonRounds(
  rounds: RoundBoardInput[],
  winners: SeasonWinnerInput[],
  members: SeasonMemberInput[] = []
): SeasonStanding[] {
  const byUser = new Map<string, SeasonStanding>();
  const ensure = (userId: string, displayName?: string): SeasonStanding => {
    let s = byUser.get(userId);
    if (!s) {
      s = {
        user_id: userId,
        display_name: displayName ?? "Player",
        correct: 0,
        decided: 0,
        missed: 0,
        picksMade: 0,
        weeklyWins: 0,
        pointsBanked: 0,
        perRound: new Map(rounds.map((r) => [r.roundNo, null])),
      };
      byUser.set(userId, s);
    }
    if (displayName && s.display_name === "Player") s.display_name = displayName;
    return s;
  };

  for (const m of members) ensure(m.userId, m.displayName);

  for (const round of rounds) {
    const winnersHere = new Set(
      winners.filter((w) => w.poolId === round.poolId).map((w) => w.userId)
    );
    for (const row of round.board) {
      const s = ensure(row.user_id, row.display_name);
      const cell: RoundCell = {
        correct: row.correct,
        decided: row.total_decided,
        picksMade: round.picksMade.get(row.user_id) ?? row.total_decided,
        won: winnersHere.has(row.user_id),
      };
      s.perRound.set(round.roundNo, cell);
      s.correct += row.correct;
      s.decided += row.total_decided;
      s.picksMade += cell.picksMade;
    }
    // A player can hold a winners row without a board row only if the
    // data is already inconsistent; still credit the win below via the
    // winners pass so points never silently vanish.
  }

  for (const w of winners) {
    const s = ensure(w.userId);
    s.weeklyWins += 1;
    s.pointsBanked += w.points;
    const round = rounds.find((r) => r.poolId === w.poolId);
    if (round) {
      const cell = s.perRound.get(round.roundNo);
      if (cell) cell.won = true;
    }
  }

  const standings = [...byUser.values()];
  for (const s of standings) s.missed = s.decided - s.correct;
  standings.sort(
    (a, b) =>
      b.correct - a.correct ||
      b.weeklyWins - a.weeklyWins ||
      a.display_name.localeCompare(b.display_name)
  );
  return standings;
}

// Which round is "current": the first linked round whose games are
// not all final; if every linked round is complete, the latest linked
// round (the page shows the finished state there); no linked rounds
// at all -> null (the season is a shell awaiting Round 1).
export function pickCurrentRoundNo(
  rounds: { roundNo: number; allFinal: boolean }[]
): number | null {
  if (rounds.length === 0) return null;
  const sorted = [...rounds].sort((a, b) => a.roundNo - b.roundNo);
  const open = sorted.find((r) => !r.allFinal);
  return open ? open.roundNo : sorted[sorted.length - 1].roundNo;
}

// -------------------------------------------------------- server part

// Load the season shell + its linked rounds. Returns null when the
// season doesn't exist OR the tables don't exist yet (migration 029
// not run) — callers render a clean "not set up" state, never a crash.
export async function loadSeason(
  supabase: any,
  seasonId: string
): Promise<Season | null> {
  const { data: season, error } = await supabase
    .from("pickem_seasons")
    .select("id, group_id, name, rounds_total, created_by, created_at")
    .eq("id", seasonId)
    .maybeSingle();
  if (error || !season) return null;

  const { data: roundRows, error: roundsError } = await supabase
    .from("pickem_season_rounds")
    .select(
      "season_id, round_no, pool_id, pickem_pools(id, name, week, season, lock_at, scratched, variant)"
    )
    .eq("season_id", seasonId)
    .order("round_no", { ascending: true });
  if (roundsError) return { season: season as SeasonRow, rounds: [] };

  const rounds: SeasonRound[] = ((roundRows ?? []) as any[])
    .filter((r) => r.pickem_pools)
    .map((r) => ({
      season_id: r.season_id,
      round_no: r.round_no,
      pool_id: r.pool_id,
      pool: r.pickem_pools as SeasonRoundPool,
    }));
  return { season: season as SeasonRow, rounds };
}

// Seasons belonging to a group (for entry-point cards). Empty when
// none exist or the migration hasn't landed yet.
export async function loadGroupSeasons(
  supabase: any,
  groupId: string
): Promise<SeasonRow[]> {
  const { data, error } = await supabase
    .from("pickem_seasons")
    .select("id, group_id, name, rounds_total, created_by, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as SeasonRow[];
}

// The season for a given pool, if the pool is linked as a round.
// Used by the pool switcher's "Season" row; null pre-migration too.
export async function loadSeasonForPool(
  supabase: any,
  poolId: string
): Promise<{ season: SeasonRow; roundNo: number } | null> {
  const { data, error } = await supabase
    .from("pickem_season_rounds")
    .select("round_no, pickem_seasons(id, group_id, name, rounds_total, created_by, created_at)")
    .eq("pool_id", poolId)
    .maybeSingle();
  if (error || !data?.pickem_seasons) return null;
  return { season: data.pickem_seasons as SeasonRow, roundNo: data.round_no as number };
}

export interface RoundGameState {
  roundNo: number;
  poolId: string;
  slateSize: number;
  finalCount: number;
  startedCount: number;
  allFinal: boolean;
}

// Game-state per linked round, derived from the games table: slate
// size, how many are final, how many have kicked off. This — not the
// winners table — decides whether a round is final / live / upcoming.
export async function loadRoundGameStates(
  supabase: any,
  rounds: SeasonRound[]
): Promise<Map<string, RoundGameState>> {
  const states = new Map<string, RoundGameState>();
  for (const r of rounds) {
    states.set(r.pool_id, {
      roundNo: r.round_no,
      poolId: r.pool_id,
      slateSize: 0,
      finalCount: 0,
      startedCount: 0,
      allFinal: false,
    });
  }
  if (rounds.length === 0) return states;

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("pool_id, game_id")
    .in("pool_id", rounds.map((r) => r.pool_id));
  const linkRows = (links ?? []) as any[];
  const gameIds = [...new Set(linkRows.map((l) => l.game_id))];
  const { data: games } = gameIds.length
    ? await supabase.from("games").select("id, status, starts_at").in("id", gameIds)
    : { data: [] };
  const gameById = new Map(((games ?? []) as any[]).map((g) => [g.id, g]));
  const nowMs = Date.now();

  for (const l of linkRows) {
    const st = states.get(l.pool_id);
    const g = gameById.get(l.game_id);
    if (!st || !g) continue;
    st.slateSize += 1;
    if (g.status === "final") st.finalCount += 1;
    if (g.starts_at && new Date(g.starts_at).getTime() <= nowMs) st.startedCount += 1;
  }
  for (const st of states.values()) {
    st.allFinal = st.slateSize > 0 && st.finalCount === st.slateSize;
  }
  return states;
}

// Full standings for a loaded season: one leaderboard per round pool
// (the same derivation the pool pages use), one picks-count pass, one
// winners pass, and the group roster for names + the 0-0 tail.
export async function computeSeasonStandings(
  supabase: any,
  loaded: Season
): Promise<SeasonStanding[]> {
  const { season, rounds } = loaded;
  const poolIds = rounds.map((r) => r.pool_id);

  const boards: RoundBoardInput[] = [];
  for (const r of rounds) {
    const board = await computePickemLeaderboard(supabase, r.pool_id);
    boards.push({ roundNo: r.round_no, poolId: r.pool_id, board, picksMade: new Map() });
  }

  const [{ data: pickRows }, { data: winnerRows }, { data: memberRows }] =
    await Promise.all([
      poolIds.length
        ? supabase.from("pickem_picks").select("pool_id, user_id").in("pool_id", poolIds)
        : Promise.resolve({ data: [] as any[] }),
      poolIds.length
        ? supabase
            .from("pickem_pool_winners")
            .select("pool_id, user_id, points")
            .in("pool_id", poolIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("group_members")
        .select("user_id, profiles(display_name)")
        .eq("group_id", season.group_id),
    ]);

  for (const p of (pickRows ?? []) as any[]) {
    const b = boards.find((x) => x.poolId === p.pool_id);
    if (b) b.picksMade.set(p.user_id, (b.picksMade.get(p.user_id) ?? 0) + 1);
  }

  const winners: SeasonWinnerInput[] = ((winnerRows ?? []) as any[]).map((w) => ({
    poolId: w.pool_id,
    userId: w.user_id,
    points: w.points,
  }));
  const members: SeasonMemberInput[] = ((memberRows ?? []) as any[]).map((m) => ({
    userId: m.user_id,
    displayName: m.profiles?.display_name ?? "Player",
  }));

  return aggregateSeasonRounds(boards, winners, members);
}
