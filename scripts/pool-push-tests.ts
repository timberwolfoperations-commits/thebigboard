// Pool push (phase 1) tests — run with: npx tsx scripts/pool-push-tests.ts
// The pure logic of lib/pool-push-logic.ts: recipient selection (who
// gets tapped and who never does), the dedupe claim, category gating,
// the reminder window, and the exact words that go out. The database
// claim and the sending itself need Supabase and a push service — none
// of that is faked here; these cases pin the parts that decide WHO
// gets a push, which is where the restraint rule lives.

import {
  REMINDER_WINDOW_MS,
  categoryForKind,
  claimNewRecipients,
  excludeUser,
  isInReminderWindow,
  missingPicksPush,
  poolFinalPush,
  poolOpenPush,
  poolPageUrl,
  prefsAllow,
  prefsFromRow,
  selectIncompletePickers,
} from "../lib/pool-push-logic";
import type { PushPayloadInput } from "../lib/push-payload";

// ------------------------------------------------------------ harness

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------- categories

check("pool_open is a needs-you push", categoryForKind("pool_open") === "needs_you");
check("missing_picks is a needs-you push", categoryForKind("missing_picks") === "needs_you");
check("pool_final is a results push", categoryForKind("pool_final") === "results");

// --------------------------------------------------------------- prefs

check("no prefs row reads as both on", eq(prefsFromRow(null), { needsYou: true, results: true }));
check(
  "undefined prefs row reads as both on",
  eq(prefsFromRow(undefined), { needsYou: true, results: true }),
);
check(
  "null columns read as on (the schema default)",
  eq(prefsFromRow({ push_needs_you: null, push_results: null }), { needsYou: true, results: true }),
);
check(
  "an explicit opt-out is respected",
  eq(prefsFromRow({ push_needs_you: false, push_results: true }), { needsYou: false, results: true }),
);
check(
  "both categories can be off",
  eq(prefsFromRow({ push_needs_you: false, push_results: false }), { needsYou: false, results: false }),
);

check("needs-you allowed when its toggle is on", prefsAllow({ needsYou: true, results: false }, "needs_you"));
check("needs-you blocked when its toggle is off", !prefsAllow({ needsYou: false, results: true }, "needs_you"));
check("results allowed when its toggle is on", prefsAllow({ needsYou: false, results: true }, "results"));
check("results blocked when its toggle is off", !prefsAllow({ needsYou: true, results: false }, "results"));

// --------------------------------------------------- recipient shaping

check(
  "the creator is excluded from their own pool-open push",
  eq(excludeUser(["a", "b", "c"], "b"), ["a", "c"]),
);
check("exclusion dedupes the entrant list", eq(excludeUser(["a", "a", "b"], "z"), ["a", "b"]));
check("excluding nobody keeps everyone", eq(excludeUser(["a"], "a"), []));

check(
  "the claim keeps only unclaimed recipients",
  eq(claimNewRecipients(["a", "b", "c"], ["b"]), ["a", "c"]),
);
check("a fully claimed pool sends nothing", eq(claimNewRecipients(["a"], ["a"]), []));
check("the claim dedupes candidates", eq(claimNewRecipients(["a", "a"], []), ["a"]));

// ---------------------------------------------- incomplete pickers

const entrants = ["full", "partial", "none", "also-full"];
const counts = new Map<string, number>([
  ["full", 14],
  ["partial", 9],
  ["also-full", 14],
]);
check(
  "only incomplete pickers are reminded (map counts)",
  eq(selectIncompletePickers(entrants, counts, 14), ["partial", "none"]),
);
check(
  "only incomplete pickers are reminded (record counts)",
  eq(selectIncompletePickers(entrants, { full: 14, partial: 9, "also-full": 14 }, 14), ["partial", "none"]),
);
check(
  "a one-pick slate: anyone without a pick is incomplete",
  eq(selectIncompletePickers(["a", "b"], new Map([["a", 1]]), 1), ["b"]),
);
check(
  "an empty slate reminds nobody",
  eq(selectIncompletePickers(entrants, counts, 0), []),
);
check(
  "extra picks (data weirdness) never count as incomplete",
  eq(selectIncompletePickers(["a"], new Map([["a", 99]]), 14), []),
);

// ----------------------------------------------------- reminder window

const now = new Date("2026-11-12T22:00:00.000Z"); // Thu 5:00 PM ET
const inMs = (ms: number) => new Date(now.getTime() + ms).toISOString();

check("a game 1h out is in the window", isInReminderWindow(inMs(60 * 60 * 1000), now));
check("a game exactly 3h out is in the window", isInReminderWindow(inMs(REMINDER_WINDOW_MS), now));
check("a game 3h + 1ms out is not yet in the window", !isInReminderWindow(inMs(REMINDER_WINDOW_MS + 1), now));
check("a game that already kicked is out of the window", !isInReminderWindow(inMs(-1), now));
check("a game kicking right now is out of the window", !isInReminderWindow(inMs(0), now));
check("no start time means no reminder", !isInReminderWindow(null, now) && !isInReminderWindow(undefined, now));
check("a garbage start time means no reminder", !isInReminderWindow("not-a-date", now));

// ---------------------------------------------------------------- copy

const url = poolPageUrl("g1", "p1");
check("the pool link matches the pick'em page route", url === "/groups/g1/pickem/p1");

const open = poolOpenPush("Week 10", url);
check("pool-open title carries the pool name", open.title === "Week 10");
check("pool-open body says picks are open", open.body.includes("Picks are open"));
check("pool-open links to the pool", open.url === url);

const noneIn = missingPicksPush("Week 10", url, 14, 14);
check(
  "missing-picks with nothing in says so, with the count",
  noneIn.body.includes("No picks in yet") && noneIn.body.includes("14"),
);
const partial = missingPicksPush("Week 10", url, 5, 14);
check(
  "missing-picks partial names the shortfall",
  partial.body.includes("Still 5 picks short") && partial.title === "Week 10",
);
const oneShort = missingPicksPush("Week 10", url, 1, 14);
check("missing-picks singularizes one pick", oneShort.body.includes("Still 1 pick short"));

const winner = poolFinalPush("Week 9", url, {
  correct: 13,
  totalDecided: 14,
  isWinner: true,
  winnerPoints: 10,
  scratched: false,
});
check(
  "a winner hears they won, with their record and points",
  winner.body.includes("You won it") && winner.body.includes("13 of 14") && winner.body.includes("10 points"),
);
const coWinnerDefaultPts = poolFinalPush("Week 9", url, {
  correct: 13,
  totalDecided: 14,
  isWinner: true,
  winnerPoints: null,
  scratched: false,
});
check("a winner with no points row defaults to 10", coWinnerDefaultPts.body.includes("10 points"));
const loser = poolFinalPush("Week 9", url, {
  correct: 8,
  totalDecided: 14,
  isWinner: false,
  winnerPoints: null,
  scratched: false,
});
check(
  "a non-winner gets their record and nothing else",
  loser.body === "It's over — you went 8 of 14." && loser.title === "Week 9",
);
const scratched = poolFinalPush("Week 9", url, {
  correct: 8,
  totalDecided: 14,
  isWinner: false,
  winnerPoints: null,
  scratched: true,
});
check("a scratched pool gets the quiet line", scratched.body.includes("Scratched — no winner"));

// No emoji anywhere in any Phase 1 copy — titles or bodies.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const allCopy: PushPayloadInput[] = [open, noneIn, partial, oneShort, winner, coWinnerDefaultPts, loser, scratched];
check(
  "no Phase 1 push copy contains an emoji",
  allCopy.every((p) => !EMOJI.test(p.title) && !EMOJI.test(p.body)),
);

// -------------------------------------------------------------- report

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  process.exit(1);
}
