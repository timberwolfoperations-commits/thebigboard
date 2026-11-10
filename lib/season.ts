// Pick'em seasons: a season is a shell over ordinary weekly pick'em
// pools (migration 029). Rounds 1..N link to pick'em pools; standings
// are DERIVED at read from those pools — per-round leaderboards from
// lib/pickem-scoring plus the pickem_pool_winners rows that already
// bank group points. Nothing is materialized, no picks or points ever
// move, and a round counts as closed only when every one of its games
// is final (derived from the games table via the leaderboard's
// decided counts and the round game states below) — never merely
// because a winners row exists.

import {
  computePickemLeaderboard,
  computePickemPickOutcomes,
  type PickemRow,
} from "@/lib/pickem-scoring";

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
  // Display stats for the leaderboard table, derived from the player's
  // decided picks in chronological order (see RoundPickOutcome):
  streak: string; // current run from the latest decided pick back: "W3" / "L1" / "—"
  last5: string; // record over the last 5 decided picks: "4-1" / "—"
  gamesBack: number; // leader's correct total minus this player's (0 = leading)
}

// ---------------------------------------------------------- pure part

// One decided pick (its game is final), the raw material for the
// streak / last-5 display stats. A player's season sequence is these
// in chronological order: round order first, then game starts_at
// within the round. Optional on the input — a round fed without
// outcomes simply contributes nothing to the sequences.
export interface RoundPickOutcome {
  userId: string;
  startsAt: string | null;
  correct: boolean;
}

export interface RoundBoardInput {
  roundNo: number;
  poolId: string;
  board: PickemRow[]; // one round's computePickemLeaderboard rows
  picksMade: Map<string, number>; // user_id -> picks made in this round
  outcomes?: RoundPickOutcome[]; // this round's decided picks, any order
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
  // Per-player decided-pick results in chronological order — the
  // sequences streak and last-5 are read off of. Built round by round
  // in round order, kickoff order inside each round.
  const sequences = new Map<string, boolean[]>();
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
        streak: "—",
        last5: "—",
        gamesBack: 0,
      };
      byUser.set(userId, s);
    }
    if (displayName && s.display_name === "Player") s.display_name = displayName;
    return s;
  };

  for (const m of members) ensure(m.userId, m.displayName);

  const orderedRounds = [...rounds].sort((a, b) => a.roundNo - b.roundNo);

  for (const round of orderedRounds) {
    if (round.outcomes) {
      const byKickoff = [...round.outcomes].sort((a, b) =>
        (a.startsAt ?? "").localeCompare(b.startsAt ?? "")
      );
      for (const o of byKickoff) {
        ensure(o.userId);
        const seq = sequences.get(o.userId) ?? [];
        seq.push(o.correct);
        sequences.set(o.userId, seq);
      }
    }
  }

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

  // Derived display stats, read after the sort: games back is measured
  // off the leader's correct total (whoever tops the sorted board),
  // streak and last-5 off each player's chronological sequence.
  const leaderCorrect = standings.length > 0 ? standings[0].correct : 0;
  for (const s of standings) {
    s.gamesBack = leaderCorrect - s.correct;
    const seq = sequences.get(s.user_id) ?? [];
    s.streak = formatStreak(seq);
    s.last5 = formatLast5(seq);
  }
  return standings;
}

// "W3" / "L1": the run the player is on, counted back from their most
// recent decided pick. "—" when nothing is decided yet.
function formatStreak(seq: boolean[]): string {
  if (seq.length === 0) return "—";
  const latest = seq[seq.length - 1];
  let n = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === latest; i--) n++;
  return `${latest ? "W" : "L"}${n}`;
}

// Record over the last (up to) 5 decided picks: "4-1". "—" when none.
function formatLast5(seq: boolean[]): string {
  if (seq.length === 0) return "—";
  const tail = seq.slice(-5);
  const wins = tail.filter(Boolean).length;
  return `${wins}-${tail.length - wins}`;
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

// The roll-forward rule (Michael, 2026-11-09): a round opens as soon
// as its slate exists — it does NOT wait for the previous round to be
// fully final, so two rounds can overlap (next round pickable while
// this round's Monday game is still pending). The page's focus round
// is therefore the ACTIONABLE round for this viewer:
//   1. the earliest round where the viewer still has unpicked games
//      that haven't kicked off;
//   2. else the earliest not-fully-final round (they're done picking
//      but a round is still live);
//   3. else the latest linked round (season complete so far).
// Round status stays per-round and independent — nothing about one
// round's state ever gates another round's picks.
export function pickFocusRoundNo(
  rounds: { roundNo: number; allFinal: boolean; unpickedUpcoming: number }[]
): number | null {
  if (rounds.length === 0) return null;
  const sorted = [...rounds].sort((a, b) => a.roundNo - b.roundNo);
  const actionable = sorted.find((r) => r.unpickedUpcoming > 0);
  if (actionable) return actionable.roundNo;
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
  // Viewer fields — only filled when a userId is passed in:
  myPicksMade: number;
  // Games the viewer hasn't picked that haven't kicked off yet —
  // the count that makes a round "actionable" for them.
  myUnpickedUpcoming: number;
}

// Game-state per linked round, derived from the games table: slate
// size, how many are final, how many have kicked off. This — not the
// winners table — decides whether a round is final / live / open.
// Each round's state is computed from its own games alone, so rounds
// overlap freely (the roll-forward rule): a freshly attached round is
// open for picks the moment its slate exists.
export async function loadRoundGameStates(
  supabase: any,
  rounds: SeasonRound[],
  userId?: string
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
      myPicksMade: 0,
      myUnpickedUpcoming: 0,
    });
  }
  if (rounds.length === 0) return states;

  const poolIds = rounds.map((r) => r.pool_id);
  const [{ data: links }, myPicksResult] = await Promise.all([
    supabase.from("pickem_pool_games").select("pool_id, game_id").in("pool_id", poolIds),
    userId
      ? supabase
          .from("pickem_picks")
          .select("pool_id, game_id")
          .in("pool_id", poolIds)
          .eq("user_id", userId)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const linkRows = (links ?? []) as any[];
  const gameIds = [...new Set(linkRows.map((l) => l.game_id))];
  const { data: games } = gameIds.length
    ? await supabase.from("games").select("id, status, starts_at").in("id", gameIds)
    : { data: [] };
  const gameById = new Map(((games ?? []) as any[]).map((g) => [g.id, g]));
  const myPickSet = new Set(
    ((myPicksResult.data ?? []) as any[]).map((p) => `${p.pool_id}:${p.game_id}`)
  );
  const nowMs = Date.now();

  for (const l of linkRows) {
    const st = states.get(l.pool_id);
    const g = gameById.get(l.game_id);
    if (!st || !g) continue;
    st.slateSize += 1;
    if (g.status === "final") st.finalCount += 1;
    const kickedOff = g.starts_at != null && new Date(g.starts_at).getTime() <= nowMs;
    if (kickedOff) st.startedCount += 1;
    if (userId) {
      if (myPickSet.has(`${l.pool_id}:${l.game_id}`)) st.myPicksMade += 1;
      else if (!kickedOff) st.myUnpickedUpcoming += 1;
    }
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
    const [board, rawOutcomes] = await Promise.all([
      computePickemLeaderboard(supabase, r.pool_id),
      computePickemPickOutcomes(supabase, r.pool_id),
    ]);
    boards.push({
      roundNo: r.round_no,
      poolId: r.pool_id,
      board,
      picksMade: new Map(),
      outcomes: rawOutcomes.map((o) => ({
        userId: o.user_id,
        startsAt: o.starts_at,
        correct: o.correct,
      })),
    });
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
