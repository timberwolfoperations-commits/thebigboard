// Poker hand-read tests — run with: npx tsx scripts/poker-handread-tests.ts
// The read is player-facing copy, so the cases pin the exact strings:
// if a phrase changes, it changes here on purpose, not by accident.

import { parseCards } from "../lib/poker/cards";
import { handRead } from "../lib/poker/hand-read";

// ------------------------------------------------------------ harness

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name} — got "${actual}", want "${expected}"`);
  }
}

// -------------------------------------------------------------- cases

// Pre-flop: names and suitedness, pockets as pairs.
check("preflop suited", handRead(parseCards("Ad Qd"), []), "Ace-Queen suited");
check("preflop pocket pair", handRead(parseCards("Ks Kh"), []), "Pair of Kings");
check("preflop offsuit", handRead(parseCards("7c 5d"), []), "Seven-Five offsuit");

// Flop draws: the mockup hand — A♦Q♦ on a two-diamond flop is a flush
// draw; the Queen is NOT an overcard on a King-high board, so the read
// stays honest and doesn't claim two.
check(
  "flush draw, one overcard only",
  handRead(parseCards("Ad Qd"), parseCards("Kd 9s 4d")),
  "A flush draw",
);
check(
  "flush draw on the turn",
  handRead(parseCards("Ad Qs"), parseCards("Kd 9d 4c 2d")),
  "A flush draw",
);
check(
  "open-ended straight draw",
  handRead(parseCards("9s 8d"), parseCards("Tc 7h 2s")),
  "An open-ended straight draw",
);
check(
  "gutshot straight draw",
  handRead(parseCards("9s 8d"), parseCards("Tc 6h 2s")),
  "A gutshot straight draw",
);
check(
  "two overcards, nothing else",
  handRead(parseCards("As Qd"), parseCards("Jd 9c 4s")),
  "Two overcards",
);

// Made hands, named for whose cards make them.
check(
  "top pair",
  handRead(parseCards("Ks Qd"), parseCards("Kd 9c 4s")),
  "Top pair — Kings",
);
check(
  "overpair",
  handRead(parseCards("As Ad"), parseCards("Kd 9c 4s")),
  "Overpair — Aces",
);
check(
  "set from a pocket pair",
  handRead(parseCards("Ks Kd"), parseCards("Kh 9c 4s")),
  "A set of Kings",
);
check(
  "two pair",
  handRead(parseCards("As Kd"), parseCards("Ad Kc 9s")),
  "Two pair — Aces and Kings",
);
check(
  "full house",
  handRead(parseCards("Ks Kd"), parseCards("Kh 9c 9s")),
  "Full house — Kings full of Nines",
);
check(
  "flush, ace high",
  handRead(parseCards("Ad Qs"), parseCards("Kd 9d 4d 2d")),
  "Flush — Ace high",
);
check(
  "straight, queen high",
  handRead(parseCards("8s 9d"), parseCards("Tc Jh Qd")),
  "Straight — Queen high",
);
check(
  "wheel straight",
  handRead(parseCards("As 2d"), parseCards("3c 4h 5s")),
  "Straight — five high (the wheel)",
);

// Caution cases: the board makes the hand, not your cards — say so.
check(
  "board pair caution",
  handRead(parseCards("As Qd"), parseCards("Ks Kd 9c 4h")),
  "The board's pair of Kings",
);
check(
  "board trips caution",
  handRead(parseCards("As Qd"), parseCards("Ks Kd Kc 4h")),
  "Three Kings on the board",
);
check(
  "board two pair caution",
  handRead(parseCards("As 2d"), parseCards("Kc Kd 9s 9h")),
  "Two pair on the board — Kings and Nines",
);

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(`Failing: ${failures.join("; ")}`);
  process.exit(1);
}
