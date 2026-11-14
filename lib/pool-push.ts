// Pool push, phase 1 — the server wiring. Pick'em only: ToM rounds
// are pick'em pools, so they ride this automatically. Survivor, bets,
// roster pools, and quiz get nothing here.
//
// Three triggers, all under the restraint rule in pool-push-logic.ts:
//   pool_open     — fired from createPickemPool, to entered players
//                   except the creator. Category: needs_you.
//   missing_picks — fired from the 15-minute sync sweep when a pool's
//                   first game starts within 3 hours, to entered
//                   players whose card isn't full. Once only.
//   pool_final    — fired from the same sweep once a pool is settled
//                   (winner awarded or scratched) with every game
//                   final: a personalized result per player who picked.
//
// Every send is claim-before-send against push_events (migration 030):
// the row insert IS the dedupe, so a derived-at-read moment detected
// by every sweep forever still produces exactly one push. Category
// prefs are read at send time. And everything here fails soft — a
// missing 030 table, a dead query, anything — resolves quietly and
// never breaks pool creation or the sync sweep.

import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUser } from "@/lib/notify";
import { computePickemLeaderboard, CONFIDENCE_PICK_COUNT } from "@/lib/pickem-scoring";
import {
  categoryForKind,
  excludeUser,
  isInReminderWindow,
  missingPicksPush,
  poolFinalPush,
  poolOpenPush,
  poolPageUrl,
  prefsAllow,
  prefsFromRow,
  selectIncompletePickers,
  type PushKind,
  type PushPrefs,
} from "@/lib/pool-push-logic";
import type { PushPayloadInput } from "@/lib/push-payload";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface PoolRow {
  id: string;
  group_id: string;
  name: string;
  variant: string;
  lock_at: string;
  created_by: string;
  winner_user_id: string | null;
  winner_points: number | null;
  scratched: boolean;
}

// ------------------------------------------------------------ claims

// Claim (kind, pool, user) rows for everyone we're about to send to;
// returns only the user ids whose rows were actually inserted — the
// rest were already claimed by an earlier run and get nothing. Throws
// when the table is missing (pre-migration deploys): callers catch
// and treat it as "feature off", so the code can ship before 030 runs.
async function claimPushEvents(
  service: ServiceClient,
  kind: PushKind,
  poolId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = userIds.map((user_id) => ({ kind, pool_id: poolId, user_id }));
  const { data, error } = await service
    .from("push_events")
    .upsert(rows, { onConflict: "kind,pool_id,user_id", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

// ------------------------------------------------------------- prefs

async function loadPrefsMap(
  service: ServiceClient,
  userIds: string[],
): Promise<Map<string, PushPrefs>> {
  const map = new Map<string, PushPrefs>();
  if (userIds.length === 0) return map;
  try {
    const { data, error } = await service
      .from("profiles")
      .select("id, push_needs_you, push_results")
      .in("id", userIds);
    if (error) return map; // columns not migrated yet — defaults apply
    for (const row of (data ?? []) as any[]) {
      map.set(row.id, prefsFromRow(row));
    }
  } catch {
    // Defaults apply; prefsFromRow(null) is both-on.
  }
  return map;
}

// ------------------------------------------------------------ sender

// The shared tail of every trigger: gate on the category pref, claim,
// then send. buildPayload is per-user so the personal copy (picks
// still missing, your final record) is computed only for the claimed.
// Returns how many pushes went out.
async function claimGateAndSend(
  service: ServiceClient,
  kind: PushKind,
  poolId: string,
  candidateIds: string[],
  buildPayload: (userId: string) => PushPayloadInput,
): Promise<number> {
  const category = categoryForKind(kind);
  const prefs = await loadPrefsMap(service, candidateIds);
  const allowed = candidateIds.filter((id) =>
    prefsAllow(prefs.get(id) ?? prefsFromRow(null), category),
  );
  const claimed = await claimPushEvents(service, kind, poolId, allowed);
  let sent = 0;
  for (const userId of claimed) {
    await sendPushToUser(userId, buildPayload(userId));
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------- entrants

// Who is "in" a pick'em pool: every member of its group, plus anyone
// holding a guest seat in this pool (open pools, migration 022).
async function poolEntrantIds(
  service: ServiceClient,
  pool: Pick<PoolRow, "id" | "group_id">,
): Promise<string[]> {
  const [{ data: members }, { data: guests }] = await Promise.all([
    service.from("group_members").select("user_id").eq("group_id", pool.group_id),
    service
      .from("pool_guests")
      .select("user_id")
      .eq("pool_type", "pickem")
      .eq("pool_id", pool.id),
  ]);
  return [
    ...((members ?? []) as any[]).map((m) => m.user_id as string),
    ...((guests ?? []) as any[]).map((g) => g.user_id as string),
  ];
}

// -------------------------------------------------------- pool-open

// Called from createPickemPool once the pool and its slate exist.
// Guests can't exist yet (the pool was just created), so entrants are
// the group members; the creator made the thing and is excluded.
// Never throws — pool creation must not fail over a courtesy tap.
export async function notifyPickemPoolOpen(pool: {
  id: string;
  group_id: string;
  name: string;
  created_by: string;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const entrants = await poolEntrantIds(service, pool);
    const recipients = excludeUser(entrants, pool.created_by);
    const url = poolPageUrl(pool.group_id, pool.id);
    await claimGateAndSend(service, "pool_open", pool.id, recipients, () =>
      poolOpenPush(pool.name, url),
    );
  } catch {
    // Stay silent — see the file header.
  }
}

// ------------------------------------------------------------- sweep

export interface PoolPushSweepStats {
  remindersSent: number;
  finalsSent: number;
}

// One pass of the time-based triggers, ridden on the 15-minute sync
// sweep next to the poker clock. Fails soft at every level: a bad pool
// never stops the next one, and a missing 030 table turns the whole
// pass into a quiet no-op (the route still gets its stats object).
export async function sweepPoolPushes(
  service: ServiceClient,
  now: Date,
): Promise<PoolPushSweepStats> {
  const stats: PoolPushSweepStats = { remindersSent: 0, finalsSent: 0 };
  try {
    stats.remindersSent = await sweepMissingPicks(service, now);
  } catch {
    // Pre-migration or a bad read — reminders just don't go out.
  }
  try {
    stats.finalsSent = await sweepPoolFinals(service, now);
  } catch {
    // Same rule for finals.
  }
  return stats;
}

async function sweepMissingPicks(service: ServiceClient, now: Date): Promise<number> {
  const { data: pools, error } = await service
    .from("pickem_pools")
    .select("id, group_id, name, variant, lock_at, created_by, winner_user_id, winner_points, scratched")
    .gt("lock_at", now.toISOString());
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const pool of (pools ?? []) as PoolRow[]) {
    try {
      sent += await missingPicksForPool(service, pool, now);
    } catch {
      // One pool's hiccup never stops the sweep.
    }
  }
  return sent;
}

async function missingPicksForPool(
  service: ServiceClient,
  pool: PoolRow,
  now: Date,
): Promise<number> {
  const { data: links } = await service
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", pool.id);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id as string);
  if (gameIds.length === 0) return 0;

  const { data: games } = await service
    .from("games")
    .select("starts_at")
    .in("id", gameIds);
  const starts = ((games ?? []) as any[])
    .map((g) => g.starts_at as string | null)
    .filter((s): s is string => Boolean(s))
    .sort();
  if (!isInReminderWindow(starts[0], now)) return 0;

  // A full card means one pick per game — or, for over/under pools,
  // one side per commish line (those picks live in their own table) —
  // or, for Top 5 Confidence pools, 5 ranked picks no matter how many
  // games are on the slate.
  const overUnder = pool.variant === "over_under";
  const confidence = pool.variant === "confidence";
  let total = confidence ? CONFIDENCE_PICK_COUNT : gameIds.length;
  if (overUnder) {
    const { count } = await service
      .from("pickem_lines")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id);
    total = count ?? 0;
  }
  if (total <= 0) return 0;

  const { data: picks } = await service
    .from(overUnder ? "pickem_prop_picks" : "pickem_picks")
    .select("user_id")
    .eq("pool_id", pool.id);
  const pickCounts = new Map<string, number>();
  for (const p of (picks ?? []) as any[]) {
    pickCounts.set(p.user_id, (pickCounts.get(p.user_id) ?? 0) + 1);
  }

  const entrants = await poolEntrantIds(service, pool);
  const incomplete = selectIncompletePickers(entrants, pickCounts, total);
  if (incomplete.length === 0) return 0;

  const url = poolPageUrl(pool.group_id, pool.id);
  return claimGateAndSend(service, "missing_picks", pool.id, incomplete, (userId) =>
    missingPicksPush(pool.name, url, total - (pickCounts.get(userId) ?? 0), total),
  );
}

async function sweepPoolFinals(service: ServiceClient, now: Date): Promise<number> {
  void now; // finals aren't time-windowed; the claim log is the clock
  // Settled pools only: crowned (winner_user_id written by the award
  // action) or scratched. An all-final pool the commish hasn't settled
  // yet isn't "over" in the app's terms — and waiting for the award is
  // what lets the winner copy name the actual co-winners.
  const { data: pools, error } = await service
    .from("pickem_pools")
    .select("id, group_id, name, variant, lock_at, created_by, winner_user_id, winner_points, scratched")
    .or("scratched.eq.true,winner_user_id.not.is.null");
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const pool of (pools ?? []) as PoolRow[]) {
    try {
      sent += await finalForPool(service, pool);
    } catch {
      // One pool's hiccup never stops the sweep.
    }
  }
  return sent;
}

async function finalForPool(service: ServiceClient, pool: PoolRow): Promise<number> {
  // Fast path: once any final push is claimed for a pool, the
  // recipient set is frozen (picks lock before games end, the award
  // is one-shot) — never recompute it on later sweeps.
  const { data: claimed, error: claimErr } = await service
    .from("push_events")
    .select("user_id")
    .eq("kind", "pool_final")
    .eq("pool_id", pool.id)
    .limit(1);
  if (claimErr) throw new Error(claimErr.message);
  if ((claimed ?? []).length > 0) return 0;

  // Belt and braces: the award/scratch actions already require every
  // game final, but the push should never say "it's over" early.
  const { data: links } = await service
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", pool.id);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id as string);
  if (gameIds.length === 0) return 0;
  const { data: games } = await service
    .from("games")
    .select("status")
    .in("id", gameIds);
  if (((games ?? []) as any[]).some((g) => g.status !== "final")) return 0;

  const board = await computePickemLeaderboard(service, pool.id);
  if (board.length === 0) return 0;

  const { data: winnerRows } = await service
    .from("pickem_pool_winners")
    .select("user_id, points")
    .eq("pool_id", pool.id);
  const winnerPoints = new Map<string, number>(
    ((winnerRows ?? []) as any[]).map((w) => [w.user_id as string, Number(w.points) || 10]),
  );
  // Legacy single-winner pools predate the co-winners table's backfill
  // coverage — winner_user_id on the pool row is the fallback crown.
  if (winnerPoints.size === 0 && pool.winner_user_id) {
    winnerPoints.set(pool.winner_user_id, pool.winner_points ?? 10);
  }

  const rowByUser = new Map(board.map((r) => [r.user_id, r]));
  const url = poolPageUrl(pool.group_id, pool.id);
  return claimGateAndSend(
    service,
    "pool_final",
    pool.id,
    board.map((r) => r.user_id),
    (userId) => {
      const row = rowByUser.get(userId);
      return poolFinalPush(pool.name, url, {
        correct: row?.correct ?? 0,
        totalDecided: row?.total_decided ?? 0,
        isWinner: winnerPoints.has(userId),
        winnerPoints: winnerPoints.get(userId) ?? null,
        scratched: pool.scratched,
      });
    },
  );
}
