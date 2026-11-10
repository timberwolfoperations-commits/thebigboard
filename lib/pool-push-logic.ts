// Pool push (phase 1) — the pure pieces. No imports, no I/O: who gets
// tapped, when the reminder window is open, whether a player's category
// prefs allow a push, and the exact words that go out. lib/pool-push.ts
// does the database work and the sending; scripts/pool-push-tests.ts
// pins everything here without a database or a push service.
//
// Michael's restraint rule is the design: a push only ever says "needs
// you" (your picks aren't in) or "it's over" (here's YOUR result).
// Nothing else — no joins, no standings swings, no other people's
// picks — ever becomes a push.

import type { PushPayloadInput } from "@/lib/push-payload";

export type PushKind = "pool_open" | "missing_picks" | "pool_final";
export type PushCategory = "needs_you" | "results";

// Which restraint bucket each trigger lives in. Pool-open and the
// missing-picks reminder both ask something of the player; pool-final
// is the personalized result.
export function categoryForKind(kind: PushKind): PushCategory {
  return kind === "pool_final" ? "results" : "needs_you";
}

export interface PushPrefs {
  needsYou: boolean;
  results: boolean;
}

// Prefs as read off a profiles row (migration 030). A missing row or
// missing columns — the migration hasn't run, a profile predates it —
// reads as both categories ON: the columns default true in the schema,
// and a not-yet-migrated database must not silently mute everyone.
export function prefsFromRow(
  row: { push_needs_you?: boolean | null; push_results?: boolean | null } | null | undefined,
): PushPrefs {
  return {
    needsYou: row?.push_needs_you !== false,
    results: row?.push_results !== false,
  };
}

export function prefsAllow(prefs: PushPrefs, category: PushCategory): boolean {
  return category === "needs_you" ? prefs.needsYou : prefs.results;
}

// Drop the person who caused the event (the commish who created the
// pool doesn't need a push telling them it's open). Dedupes too.
export function excludeUser(userIds: string[], excludedId: string): string[] {
  return [...new Set(userIds)].filter((id) => id !== excludedId);
}

// The dedupe claim, as a pure filter: of the candidates, only those
// not already in the sent-log are new. lib/pool-push.ts enforces the
// same rule atomically in the database (insert-ignore on the
// push_events primary key) — this mirror exists so the selection
// logic is testable, and the DB result is what actually gates sends.
export function claimNewRecipients(candidateIds: string[], alreadyClaimedIds: string[]): string[] {
  const claimed = new Set(alreadyClaimedIds);
  return [...new Set(candidateIds)].filter((id) => !claimed.has(id));
}

// Missing-picks recipients: entered players whose card isn't full.
// pickCounts maps user_id -> picks made; anyone absent from the map
// has made none. A pool with no games has nothing to remind about.
export function selectIncompletePickers(
  entrantIds: string[],
  pickCounts: ReadonlyMap<string, number> | Record<string, number>,
  totalGames: number,
): string[] {
  if (totalGames <= 0) return [];
  const countOf = (id: string): number => {
    if (pickCounts instanceof Map) return pickCounts.get(id) ?? 0;
    return (pickCounts as Record<string, number>)[id] ?? 0;
  };
  return [...new Set(entrantIds)].filter((id) => countOf(id) < totalGames);
}

// The reminder window: the pool's first game starts within the next
// three hours but hasn't started yet. Open at exactly 3h out, closed
// the moment the first game kicks (picks for it are locked anyway).
export const REMINDER_WINDOW_MS = 3 * 60 * 60 * 1000;

export function isInReminderWindow(
  earliestStartIso: string | null | undefined,
  now: Date,
  windowMs: number = REMINDER_WINDOW_MS,
): boolean {
  if (!earliestStartIso) return false;
  const start = new Date(earliestStartIso).getTime();
  if (!Number.isFinite(start)) return false;
  const delta = start - now.getTime();
  return delta > 0 && delta <= windowMs;
}

// ------------------------------------------------------------- copy
//
// Short, group-chat voice, no emoji. Titles carry the pool name;
// bodies carry the personal fact. Deep link is the pool page, same as
// poker's table links.

export function poolPageUrl(groupId: string, poolId: string): string {
  return `/groups/${groupId}/pickem/${poolId}`;
}

export function poolOpenPush(poolName: string, url: string): PushPayloadInput {
  return {
    title: poolName,
    body: "Picks are open. Get yours in before lock.",
    url,
  };
}

export function missingPicksPush(
  poolName: string,
  url: string,
  missing: number,
  total: number,
): PushPayloadInput {
  const noun = missing === 1 ? "pick" : "picks";
  return {
    title: poolName,
    body:
      missing >= total
        ? `No picks in yet — all ${total} are waiting, and the first game locks soon.`
        : `Still ${missing} ${noun} short of a full card — first game locks soon.`,
    url,
  };
}

export interface FinalResultInput {
  correct: number;
  totalDecided: number;
  isWinner: boolean;
  winnerPoints: number | null; // from pickem_pool_winners, when crowned
  scratched: boolean;
}

// The pool-final push, personalized: your record, your win if you got
// one. Scratched pools get one quiet line — the result is "there is no
// result", and players who picked deserve to hear it exactly once.
export function poolFinalPush(
  poolName: string,
  url: string,
  result: FinalResultInput,
): PushPayloadInput {
  if (result.scratched) {
    return { title: poolName, body: "Scratched — no winner this time.", url };
  }
  const record = `${result.correct} of ${result.totalDecided}`;
  if (result.isWinner) {
    const pts = result.winnerPoints ?? 10;
    return {
      title: poolName,
      body: `You won it — ${record} right, ${pts} points banked.`,
      url,
    };
  }
  return { title: poolName, body: `It's over — you went ${record}.`, url };
}
