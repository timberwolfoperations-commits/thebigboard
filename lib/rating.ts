import { computePickemLeaderboard } from "@/lib/pickem-scoring";
import { computeSurvivorState } from "@/lib/survivor";

// Player rating (spec: RATING-SPEC.md, approved 2026-10-30). One
// career number per player, Madden-style, blended from how well they
// pick and answer — not how much they play. The blend is deliberately
// NOT shown anywhere on the site; pages display the number and the raw
// stat line only. Derived at read like everything else here: no
// column, no cron, no stored rating.
//
// Calls = graded predictions: pick'em picks (graded by the same code
// as the pool boards — never re-implemented), survivor picks (win =
// hit, tie = miss, no-pick week = not a call), quiz answers from
// finished runs. Titles come from the winner tables + survivor
// championships. Scratched pools: picks count, no title, and the pool
// doesn't count as a settled competition entered.

export interface PlayerRating {
  rating: number | null; // null = NR (fewer than 15 total calls)
  pickAcc: number | null; // pick'em + survivor combined
  quizAcc: number | null;
  titles: number;
  calls: number; // total calls, all kinds
  settledEntered: number;
}

// Anchor tables: [input, subscore], linear between points, clamped at
// the ends. These (not the weights) are the tuning knob if a real
// crew's spread comes out too tight or too wide — retune only on
// Michael's explicit call.
const PICK_ANCHORS: [number, number][] = [
  [0.42, 40],
  [0.56, 70],
  [0.7, 100],
];
const QUIZ_ANCHORS: [number, number][] = [
  [0.4, 55],
  [0.6, 75],
  [0.8, 95],
];
const WIN_ANCHORS: [number, number][] = [
  [0, 50],
  [0.1, 70],
  [0.2, 85],
  [0.33, 100],
];
const PARTICIPATION_ANCHORS: [number, number][] = [
  [25, 55],
  [100, 70],
  [300, 85],
  [600, 95],
];
// 15, lowered from the spec's 25 on Michael's call (2026-10-30) after
// the real Test of Manhood board showed 5 of 9 members NR at ~24 calls
// — two full rounds shouldn't leave a board dark. Participation
// anchors are unchanged, so 15–25 calls all score the 55 floor there.
const MIN_CALLS = 15;

function anchor(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

interface Agg {
  pickCalls: number;
  pickHits: number;
  quizCalls: number;
  quizHits: number;
  titles: number;
  settledEntered: number;
}

export async function getRatings(
  supabase: any,
  userIds: string[]
): Promise<Map<string, PlayerRating>> {
  const out = new Map<string, PlayerRating>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return out;
  const wanted = new Set(ids);
  const agg = new Map<string, Agg>();
  const blank = (): Agg => ({
    pickCalls: 0,
    pickHits: 0,
    quizCalls: 0,
    quizHits: 0,
    titles: 0,
    settledEntered: 0,
  });
  const forUser = (uid: string) => {
    let a = agg.get(uid);
    if (!a) {
      a = blank();
      agg.set(uid, a);
    }
    return a;
  };

  // ---- pick'em: calls/hits via the board's own grading --------------
  // Pick'em has NO entrant table — a pool's players are whoever picked
  // (any group member can play), so pools are discovered from the
  // picks themselves: pickem_picks for standard pools,
  // pickem_prop_picks for over/under pools. The first version walked a
  // "pickem_pool_players" table that does not exist; the query failed
  // silently and pick'em calls never counted at all (caught by the
  // acceptance check on real data, 2026-10-30).
  const { data: pickRows } = await supabase
    .from("pickem_picks")
    .select("pool_id")
    .in("user_id", ids);
  const { data: propRows } = await supabase
    .from("pickem_prop_picks")
    .select("pool_id")
    .in("user_id", ids);
  const pickemPoolIds = [
    ...new Set([
      ...((pickRows ?? []) as any[]).map((r) => r.pool_id as string),
      ...((propRows ?? []) as any[]).map((r) => r.pool_id as string),
    ]),
  ];
  if (pickemPoolIds.length > 0) {
    const { data: pools } = await supabase
      .from("pickem_pools")
      .select("id, winner_user_id, scratched")
      .in("id", pickemPoolIds);
    const poolById = new Map(((pools ?? []) as any[]).map((p) => [p.id, p]));
    for (const poolId of pickemPoolIds) {
      let participants: string[] = [];
      try {
        const rows = await computePickemLeaderboard(supabase, poolId);
        for (const r of rows) {
          if (!wanted.has(r.user_id)) continue;
          participants.push(r.user_id);
          const a = forUser(r.user_id);
          a.pickCalls += r.total_decided;
          a.pickHits += r.correct;
        }
      } catch {
        // A pool whose variant can't grade yet contributes nothing
        // rather than breaking every board that shows a rating.
      }
      const pool = poolById.get(poolId);
      if (pool && pool.winner_user_id != null && !pool.scratched) {
        for (const uid of participants) forUser(uid).settledEntered += 1;
      }
    }
    const { data: winnerRows } = await supabase
      .from("pickem_pool_winners")
      .select("user_id")
      .in("user_id", ids);
    for (const w of (winnerRows ?? []) as any[]) forUser(w.user_id).titles += 1;
  }

  // ---- survivor: graded picks + championships, derived at read ------
  const { data: survEntries } = await supabase
    .from("survivor_entries")
    .select("pool_id, user_id")
    .in("user_id", ids);
  const survPoolIds = [...new Set(((survEntries ?? []) as any[]).map((e) => e.pool_id))];
  for (const poolId of survPoolIds) {
    try {
      const state = await computeSurvivorState(supabase, poolId);
      for (const entry of state.entries) {
        if (!wanted.has(entry.user_id)) continue;
        const a = forUser(entry.user_id);
        for (const pick of entry.picks.values()) {
          if (pick.result === "win") {
            a.pickCalls += 1;
            a.pickHits += 1;
          } else if (pick.result === "loss") {
            a.pickCalls += 1;
          }
        }
        if (state.decided) a.settledEntered += 1;
      }
      for (const champ of state.champions) {
        if (wanted.has(champ.user_id)) forUser(champ.user_id).titles += 1;
      }
    } catch {
      // Same tolerance as pick'em above.
    }
  }

  // ---- quiz: answers from finished runs ------------------------------
  const { data: runs } = await supabase
    .from("quiz_runs")
    .select("id, user_id, quiz_id")
    .in("user_id", ids)
    .not("finished_at", "is", null);
  const runList = (runs ?? []) as any[];
  if (runList.length > 0) {
    const runUser = new Map(runList.map((r) => [r.id, r.user_id as string]));
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("run_id, correct")
      .in("run_id", runList.map((r) => r.id));
    for (const ans of (answers ?? []) as any[]) {
      const uid = runUser.get(ans.run_id);
      if (!uid) continue;
      const a = forUser(uid);
      a.quizCalls += 1;
      if (ans.correct) a.quizHits += 1;
    }
    // Settled-entered: distinct quizzes the user finished that have
    // since closed.
    const quizIds = [...new Set(runList.map((r) => r.quiz_id))];
    const { data: quizRows } = await supabase
      .from("quizzes")
      .select("id, close_at")
      .in("id", quizIds);
    const closed = new Set(
      ((quizRows ?? []) as any[])
        .filter((q) => q.close_at && new Date(q.close_at).getTime() <= Date.now())
        .map((q) => q.id)
    );
    const counted = new Set<string>();
    for (const r of runList) {
      const key = `${r.user_id}:${r.quiz_id}`;
      if (closed.has(r.quiz_id) && !counted.has(key)) {
        counted.add(key);
        forUser(r.user_id).settledEntered += 1;
      }
    }
  }
  const { data: quizWinnerRows } = await supabase
    .from("quiz_winners")
    .select("user_id")
    .in("user_id", ids);
  for (const w of (quizWinnerRows ?? []) as any[]) forUser(w.user_id).titles += 1;

  // ---- blend ----------------------------------------------------------
  for (const uid of ids) {
    const a = agg.get(uid) ?? blank();
    const calls = a.pickCalls + a.quizCalls;
    const pickAcc = a.pickCalls > 0 ? a.pickHits / a.pickCalls : null;
    const quizAcc = a.quizCalls > 0 ? a.quizHits / a.quizCalls : null;
    let rating: number | null = null;
    if (calls >= MIN_CALLS) {
      // Missing ingredients drop out and the rest rescale — never
      // zero-punish a player for a game they don't play.
      const parts: [number, number][] = [];
      if (pickAcc != null) parts.push([anchor(pickAcc, PICK_ANCHORS), 0.45]);
      if (quizAcc != null) parts.push([anchor(quizAcc, QUIZ_ANCHORS), 0.25]);
      if (a.settledEntered > 0)
        parts.push([anchor(a.titles / a.settledEntered, WIN_ANCHORS), 0.2]);
      parts.push([anchor(calls, PARTICIPATION_ANCHORS), 0.1]);
      const wSum = parts.reduce((s, [, w]) => s + w, 0);
      const raw = parts.reduce((s, [v, w]) => s + v * w, 0) / wSum;
      rating = Math.min(99, Math.max(40, Math.round(raw)));
    }
    out.set(uid, {
      rating,
      pickAcc,
      quizAcc,
      titles: a.titles,
      calls,
      settledEntered: a.settledEntered,
    });
  }
  return out;
}
