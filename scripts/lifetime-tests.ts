// Lifetime-points scope tests — run with: npx tsx scripts/lifetime-tests.ts
// Covers the pure merge at the heart of lib/lifetime.ts
// (tallyLifetimeSources), above all the 2026-11-10 scope rule: pick'em
// winners of a pool attached to a SEASON are season-internal and must
// not feed the group lifetime board, while standalone pools, quizzes,
// poker, roster pools, and settled bets keep paying as always.
//
// The season fixture is faithful to the real Test of Manhood season
// reviewed 2026-11-09: four season pools (NFL Weeks 6-9) with 9
// co-winner rows at 10 pts each — Davis Burton x3, and one apiece for
// Gaymez7, Big Red, Happy Gilmore, Lafferty, Aaron Schreiber, Bill
// McC. Every one of those 90 points is a season weekly win, so after
// the scope rule the group's pick'em contribution is exactly zero.

import { tallyLifetimeSources, type LifetimeSources } from "../lib/lifetime";

// ------------------------------------------------------------ harness

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const empty: LifetimeSources = {
  settledBets: [],
  poolWinners: [],
  pickemWinners: [],
  quizWinners: [],
  pokerWinners: [],
  seasonPoolIds: new Set(),
};

// ------------------------------------------------------- the ToM fixture

const DAVIS = "u-davis";
const GAYMEZ = "u-gaymez";
const BIGRED = "u-bigred";
const HAPPY = "u-happy";
const LAFFERTY = "u-lafferty";
const AARON = "u-aaron";
const BILL = "u-bill";

const S1 = "pool-week-6";
const S2 = "pool-week-7";
const S3 = "pool-week-8";
const S4 = "pool-week-9";
const tomSeasonPoolIds = new Set([S1, S2, S3, S4]);

// The 9 real co-winner rows (10 pts each), pool by pool.
const tomSeasonWinners: LifetimeSources["pickemWinners"] = [
  { pool_id: S1, user_id: GAYMEZ, points: 10 },
  { pool_id: S1, user_id: BIGRED, points: 10 },
  { pool_id: S1, user_id: HAPPY, points: 10 },
  { pool_id: S2, user_id: DAVIS, points: 10 },
  { pool_id: S2, user_id: LAFFERTY, points: 10 },
  { pool_id: S3, user_id: AARON, points: 10 },
  { pool_id: S3, user_id: DAVIS, points: 10 },
  { pool_id: S4, user_id: BILL, points: 10 },
  { pool_id: S4, user_id: DAVIS, points: 10 },
];

// ------------------------------------------- season wins are excluded

{
  const board = tallyLifetimeSources({
    ...empty,
    pickemWinners: tomSeasonWinners,
    seasonPoolIds: tomSeasonPoolIds,
  });
  check(
    "season-only group: board is completely empty (all 90 pts are season-internal)",
    board.size === 0,
    `got ${board.size} rows`
  );
  check(
    "season-only group: Davis's 3 weekly wins / 30 pts do not appear",
    board.get(DAVIS) === undefined
  );
}

// ------------------------------- the same rows count with no season --

{
  const board = tallyLifetimeSources({
    ...empty,
    pickemWinners: tomSeasonWinners,
    seasonPoolIds: new Set(),
  });
  check(
    "no season linkage: Davis counts 30 pts / 3 wins (pre-rule behavior)",
    board.get(DAVIS)?.points === 30 && board.get(DAVIS)?.wins === 3,
    JSON.stringify(board.get(DAVIS))
  );
  check(
    "no season linkage: all 9 co-winner rows land (90 pts total)",
    [...board.values()].reduce((a, x) => a + x.points, 0) === 90 &&
      [...board.values()].reduce((a, x) => a + x.wins, 0) === 9
  );
}

// --------------------------------- standalone pools still pay --------

{
  const board = tallyLifetimeSources({
    ...empty,
    pickemWinners: [
      ...tomSeasonWinners,
      { pool_id: "pool-standalone", user_id: DAVIS, points: 10 },
      { pool_id: "pool-standalone", user_id: GAYMEZ, points: 10 },
    ],
    seasonPoolIds: tomSeasonPoolIds,
  });
  check(
    "standalone pool pays alongside a season: Davis 10 pts / 1 win (standalone only)",
    board.get(DAVIS)?.points === 10 && board.get(DAVIS)?.wins === 1,
    JSON.stringify(board.get(DAVIS))
  );
  check(
    "standalone pool pays alongside a season: Gaymez7 10 pts / 1 win",
    board.get(GAYMEZ)?.points === 10 && board.get(GAYMEZ)?.wins === 1
  );
  check(
    "standalone pool pays alongside a season: season-only winners stay off the board",
    board.get(BILL) === undefined && board.get(HAPPY) === undefined
  );
}

// --------------------------- the other four sources are untouched ----

{
  const board = tallyLifetimeSources({
    settledBets: [{ proposed_winner_id: DAVIS, points: 25 }],
    poolWinners: [{ winner_user_id: GAYMEZ, winner_points: 40 }],
    pickemWinners: tomSeasonWinners,
    quizWinners: [{ user_id: BIGRED, points: 10 }],
    pokerWinners: [{ user_id: DAVIS, points: 10 }],
    seasonPoolIds: tomSeasonPoolIds,
  });
  check(
    "other sources: Davis = settled bet 25 + poker 10 (season pick'em excluded)",
    board.get(DAVIS)?.points === 35 && board.get(DAVIS)?.wins === 2,
    JSON.stringify(board.get(DAVIS))
  );
  check(
    "other sources: roster-pool champ still counts (40 pts / 1 win)",
    board.get(GAYMEZ)?.points === 40 && board.get(GAYMEZ)?.wins === 1
  );
  check(
    "other sources: quiz winner still counts (10 pts / 1 win)",
    board.get(BIGRED)?.points === 10 && board.get(BIGRED)?.wins === 1
  );
}

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
