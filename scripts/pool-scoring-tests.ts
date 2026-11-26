// Player scoring-table tests — run with: npx tsx scripts/pool-scoring-tests.ts
// Covers the pure part of lib/pool-scoring.ts behind the roster pool's
// "Player scoring" table: the compact stat line under each player's
// base points. Only nonzero stats show, in the formula's reading
// order, so a quiet player reads as an empty line ("No stats yet")
// and a big game reads as the stats that actually scored.

import { formatPlayerStatLine } from "../lib/pool-scoring";

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

// ------------------------------------------------------- the stat line

check(
  "stat line: a QB's big game reads in formula order",
  formatPlayerStatLine({
    PASS_YD: 245,
    PASS_TD: 2,
    INT: 1,
    RUSH_YD: 32,
    RUSH_TD: 0,
    REC: 0,
    REC_YD: 0,
    REC_TD: 0,
    FUM_LOST: 0,
  }) === "245 pass yds · 2 pass TD · 1 INT · 32 rush yds",
  formatPlayerStatLine({ PASS_YD: 245, PASS_TD: 2, INT: 1, RUSH_YD: 32 })
);

check(
  "stat line: a receiver's line shows only what he did",
  formatPlayerStatLine({ REC: 6, REC_YD: 92, REC_TD: 1 }) ===
    "6 rec · 92 rec yds · 1 rec TD"
);

check(
  "stat line: zeroes and missing keys are dropped",
  formatPlayerStatLine({ PASS_YD: 0, RUSH_TD: 0, FUM_LOST: 1 }) === "1 fum lost"
);

check(
  "stat line: nothing scored yet is an empty line",
  formatPlayerStatLine({}) === "" &&
    formatPlayerStatLine({ PASS_YD: 0, REC: 0 }) === ""
);

check(
  "stat line: a key outside the formula still shows, after the known ones",
  formatPlayerStatLine({ REC_YD: 40, SACK: 2 }) === "40 rec yds · 2 SACK"
);

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
