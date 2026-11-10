// Season aggregation tests — run with: npx tsx scripts/season-tests.ts
// Covers the pure heart of lib/season.ts: folding per-round pick'em
// leaderboards + winners rows into season standings. The main fixture
// is fabricated but faithful to the real Test of Manhood season
// reviewed 2026-11-09 (Rounds 1-4 = NFL Weeks 6-9): a 3-way tie in
// Round 1, a 1-pick round (Bill McC, Week 7), a late joiner (Aaron,
// from Round 2), a member who has never picked (Joe Gomez). The known
// real totals are the oracle: leader Davis Burton — 37 correct, 3
// weekly wins, 30 points banked.

import {
  aggregateSeasonRounds,
  pickCurrentRoundNo,
  pickFocusRoundNo,
  type RoundBoardInput,
  type SeasonMemberInput,
  type SeasonWinnerInput,
} from "../lib/season";
import type { PickemRow } from "../lib/pickem-scoring";

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

function row(user_id: string, display_name: string, correct: number, decided: number): PickemRow {
  return {
    user_id,
    display_name,
    correct,
    total_decided: decided,
    points: correct,
    earliest_pick: "2026-10-18T12:00:00Z",
  };
}

const picksMap = (entries: [string, number][]) => new Map(entries);

// ------------------------------------------------------- the ToM fixture

const R1 = "pool-week-6";
const R2 = "pool-week-7";
const R3 = "pool-week-8";
const R4 = "pool-week-9";

const rounds: RoundBoardInput[] = [
  {
    roundNo: 1,
    poolId: R1,
    board: [
      row("gaymez", "Gaymez7", 7, 12),
      row("bigred", "Big Red", 7, 12),
      row("happy", "Happy Gilmore", 7, 12),
      row("bill", "Bill McC", 5, 12),
      row("lafferty", "Lafferty, Daniel", 5, 12),
      row("mark", "Mark Long", 5, 12),
      row("davis", "Davis Burton", 4, 11),
    ],
    picksMade: picksMap([
      ["gaymez", 12], ["bigred", 12], ["happy", 12], ["bill", 12],
      ["lafferty", 12], ["mark", 12], ["davis", 11],
    ]),
  },
  {
    roundNo: 2,
    poolId: R2,
    board: [
      row("davis", "Davis Burton", 9, 13),
      row("lafferty", "Lafferty, Daniel", 9, 13),
      row("aaron", "Aaron Schreiber", 8, 13),
      row("happy", "Happy Gilmore", 8, 13),
      row("gaymez", "Gaymez7", 7, 13),
      row("mark", "Mark Long", 7, 13),
      row("bigred", "Big Red", 4, 13),
      row("bill", "Bill McC", 1, 1), // the 1-pick round
    ],
    picksMade: picksMap([
      ["davis", 13], ["lafferty", 13], ["aaron", 13], ["happy", 13],
      ["gaymez", 13], ["mark", 13], ["bigred", 13], ["bill", 1],
    ]),
  },
  {
    roundNo: 3,
    poolId: R3,
    board: [
      row("aaron", "Aaron Schreiber", 11, 13),
      row("davis", "Davis Burton", 11, 13),
      row("bigred", "Big Red", 10, 13),
      row("bill", "Bill McC", 10, 13),
      row("gaymez", "Gaymez7", 10, 13),
      row("lafferty", "Lafferty, Daniel", 10, 13),
      row("mark", "Mark Long", 10, 13),
      row("happy", "Happy Gilmore", 9, 13),
      row("ron", "Ron Schreiber", 6, 12),
    ],
    picksMade: picksMap([
      ["aaron", 13], ["davis", 13], ["bigred", 13], ["bill", 13], ["gaymez", 13],
      ["lafferty", 13], ["mark", 13], ["happy", 13], ["ron", 12],
    ]),
  },
  {
    roundNo: 4,
    poolId: R4,
    board: [
      row("bill", "Bill McC", 13, 14),
      row("davis", "Davis Burton", 13, 14),
      row("aaron", "Aaron Schreiber", 12, 14),
      row("happy", "Happy Gilmore", 12, 14),
      row("gaymez", "Gaymez7", 12, 14),
      row("bigred", "Big Red", 12, 14),
      row("mark", "Mark Long", 11, 14),
      row("lafferty", "Lafferty, Daniel", 9, 10),
    ],
    picksMade: picksMap([
      ["bill", 14], ["davis", 14], ["aaron", 14], ["happy", 14],
      ["gaymez", 14], ["bigred", 14], ["mark", 14], ["lafferty", 10],
    ]),
  },
];

const winners: SeasonWinnerInput[] = [
  { poolId: R1, userId: "gaymez", points: 10 },
  { poolId: R1, userId: "bigred", points: 10 },
  { poolId: R1, userId: "happy", points: 10 },
  { poolId: R2, userId: "davis", points: 10 },
  { poolId: R2, userId: "lafferty", points: 10 },
  { poolId: R3, userId: "aaron", points: 10 },
  { poolId: R3, userId: "davis", points: 10 },
  { poolId: R4, userId: "bill", points: 10 },
  { poolId: R4, userId: "davis", points: 10 },
];

const members: SeasonMemberInput[] = [
  { userId: "bigred", displayName: "Big Red" },
  { userId: "gaymez", displayName: "Gaymez7" },
  { userId: "mark", displayName: "Mark Long" },
  { userId: "bill", displayName: "Bill McC" },
  { userId: "lafferty", displayName: "Lafferty, Daniel" },
  { userId: "davis", displayName: "Davis Burton" },
  { userId: "happy", displayName: "Happy Gilmore" },
  { userId: "aaron", displayName: "Aaron Schreiber" },
  { userId: "ron", displayName: "Ron Schreiber" },
  { userId: "joe", displayName: "Joe Gomez" }, // never picked
];

const standings = aggregateSeasonRounds(rounds, winners, members);
const byId = new Map(standings.map((s) => [s.user_id, s]));

// ------------------------------------------------------- the leader

const davis = byId.get("davis")!;
check("leader is Davis Burton", standings[0].user_id === "davis", standings[0].display_name);
check("Davis: 37 correct across the four rounds", davis.correct === 37, `${davis.correct}`);
check("Davis: 51 decided, 14 missed", davis.decided === 51 && davis.missed === 14);
check("Davis: 3 weekly wins, 30 points banked", davis.weeklyWins === 3 && davis.pointsBanked === 30);
check(
  "Davis: won flags on rounds 2/3/4, not round 1",
  davis.perRound.get(2)?.won === true &&
    davis.perRound.get(3)?.won === true &&
    davis.perRound.get(4)?.won === true &&
    davis.perRound.get(1)?.won === false
);
check(
  "Davis: round 1 cell is his worst round (4 of 11)",
  davis.perRound.get(1)?.correct === 4 && davis.perRound.get(1)?.decided === 11
);

// ------------------------------------------------------- the field

check("standings include all 10 group members", standings.length === 10, `${standings.length}`);

const gaymez = byId.get("gaymez")!;
const happy = byId.get("happy")!;
check("Gaymez7 and Happy Gilmore both sit at 36 correct", gaymez.correct === 36 && happy.correct === 36);
check(
  "36-tie with equal wins breaks by name (Gaymez7 above Happy Gilmore)",
  standings.findIndex((s) => s.user_id === "gaymez") < standings.findIndex((s) => s.user_id === "happy")
);
check(
  "co-winners of the 3-way Round 1 tie each bank a win and 10 pts",
  gaymez.weeklyWins === 1 && gaymez.pointsBanked === 10 && happy.weeklyWins === 1 && byId.get("bigred")!.pointsBanked === 10
);
check(
  "total banked points across the season = 90 (9 co-winner rows x 10)",
  standings.reduce((sum, s) => sum + s.pointsBanked, 0) === 90
);

// ------------------------------------------------- gaps in the record

const aaron = byId.get("aaron")!;
check("late joiner Aaron: 31 correct over 3 rounds", aaron.correct === 31 && aaron.decided === 40);
check("late joiner Aaron: Round 1 cell is null (didn't pick)", aaron.perRound.get(1) === null);
check("late joiner Aaron: Round 3 cell shows his co-win", aaron.perRound.get(3)?.correct === 11 && aaron.perRound.get(3)?.won === true);

const bill = byId.get("bill")!;
check("Bill's 1-pick round survives aggregation", bill.perRound.get(2)?.picksMade === 1 && bill.perRound.get(2)?.correct === 1);
check("Bill: 29 correct, and Round 4's co-win credited", bill.correct === 29 && bill.weeklyWins === 1);

const ron = byId.get("ron")!;
check(
  "Ron picked in one round only: cells null elsewhere",
  ron.perRound.get(3)?.correct === 6 && ron.perRound.get(1) === null && ron.perRound.get(2) === null && ron.perRound.get(4) === null
);

const joe = byId.get("joe")!;
check("never-picked member rides the bottom at 0-0", standings[standings.length - 1].user_id === "joe" && joe.correct === 0 && joe.decided === 0 && joe.weeklyWins === 0);
check("never-picked member has all-null round cells", [...joe.perRound.values()].every((c) => c === null));

// --------------------------------------------------- ordering rules

const tieRounds: RoundBoardInput[] = [
  {
    roundNo: 1,
    poolId: "tie-pool",
    board: [row("aaa", "Alpha", 5, 10), row("bbb", "Bravo", 5, 10)],
    picksMade: picksMap([["aaa", 10], ["bbb", 10]]),
  },
];
const tieStandings = aggregateSeasonRounds(tieRounds, [{ poolId: "tie-pool", userId: "bbb", points: 10 }]);
check(
  "equal correct breaks by weekly wins before name",
  tieStandings[0].user_id === "bbb",
  tieStandings.map((s) => s.user_id).join(",")
);

// ------------------------------------------------- current-round pick

check("no linked rounds -> no current round", pickCurrentRoundNo([]) === null);
check(
  "first not-all-final round is current",
  pickCurrentRoundNo([
    { roundNo: 1, allFinal: true },
    { roundNo: 2, allFinal: false },
    { roundNo: 3, allFinal: false },
  ]) === 2
);
check(
  "all rounds final -> latest round is current",
  pickCurrentRoundNo([
    { roundNo: 1, allFinal: true },
    { roundNo: 2, allFinal: true },
    { roundNo: 4, allFinal: true },
  ]) === 4
);

// ------------------------------------------- roll-forward focus round

check("focus: no linked rounds -> null", pickFocusRoundNo([]) === null);
check(
  "focus: roll-forward — Round 5 open while Round 4 still pending beats Round 4 for a finished viewer",
  pickFocusRoundNo([
    { roundNo: 4, allFinal: false, unpickedUpcoming: 0 },
    { roundNo: 5, allFinal: false, unpickedUpcoming: 13 },
  ]) === 5
);
check(
  "focus: earliest actionable round wins when two rounds are open at once",
  pickFocusRoundNo([
    { roundNo: 4, allFinal: false, unpickedUpcoming: 1 },
    { roundNo: 5, allFinal: false, unpickedUpcoming: 13 },
  ]) === 4
);
check(
  "focus: nothing actionable falls back to the earliest unfinished round",
  pickFocusRoundNo([
    { roundNo: 4, allFinal: false, unpickedUpcoming: 0 },
    { roundNo: 5, allFinal: false, unpickedUpcoming: 0 },
  ]) === 4
);
check(
  "focus: everything final lands on the latest round",
  pickFocusRoundNo([
    { roundNo: 4, allFinal: true, unpickedUpcoming: 0 },
    { roundNo: 5, allFinal: true, unpickedUpcoming: 0 },
  ]) === 5
);

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
