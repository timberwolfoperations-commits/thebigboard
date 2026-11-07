// Poker — a plain-English read of your own two cards (plus the board),
// for the "You've got:" line on the table screen. Pure logic, no I/O.
//
// Conservative on purpose: it names the made hand the evaluator finds,
// flags the standard draws, and otherwise says less. It never quotes
// odds or equity — "top pair" is a fact, "you're ahead" is a guess.

import type { Card } from "./cards";
import { CATEGORY, evaluateHand } from "./evaluate";

const RANK_NAME: Record<number, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RANK_PLURAL: Record<number, string> = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
  8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------- pre-flop

function preflopRead(hole: Card[]): string {
  const [hi, lo] = [...hole].sort((a, b) => b.rank - a.rank);
  if (hi.rank === lo.rank) return `Pair of ${RANK_PLURAL[hi.rank]}`;
  return `${RANK_NAME[hi.rank]}-${RANK_NAME[lo.rank]} ${hi.suit === lo.suit ? "suited" : "offsuit"}`;
}

// ------------------------------------------------------------ made hand

// Name the made hand, honestly about whose cards make it: pairing the
// board is a different thing from pairing your hand, and board trips
// belong to everyone.
function madeRead(category: number, tiebreak: number[], hole: Card[], board: Card[]): string {
  const inHole = (rank: number) => hole.filter((c) => c.rank === rank).length;
  switch (category) {
    case CATEGORY.STRAIGHT_FLUSH:
      return tiebreak[0] === 14
        ? "Royal flush"
        : `Straight flush — ${RANK_NAME[tiebreak[0]]} high`;
    case CATEGORY.QUADS:
      return `Four of a kind — ${RANK_PLURAL[tiebreak[0]]}`;
    case CATEGORY.FULL_HOUSE:
      return `Full house — ${RANK_PLURAL[tiebreak[0]]} full of ${RANK_PLURAL[tiebreak[1]]}`;
    case CATEGORY.FLUSH:
      return `Flush — ${RANK_NAME[tiebreak[0]]} high`;
    case CATEGORY.STRAIGHT:
      return tiebreak[0] === 5
        ? "Straight — five high (the wheel)"
        : `Straight — ${RANK_NAME[tiebreak[0]]} high`;
    case CATEGORY.TRIPS: {
      const r = tiebreak[0];
      if (inHole(r) === 2) return `A set of ${RANK_PLURAL[r]}`;
      if (inHole(r) === 1) return `Three of a kind — ${RANK_PLURAL[r]}`;
      return `Three ${RANK_PLURAL[r]} on the board`;
    }
    case CATEGORY.TWO_PAIR: {
      const [hi, lo] = tiebreak;
      if (inHole(hi) === 0 && inHole(lo) === 0) {
        return `Two pair on the board — ${RANK_PLURAL[hi]} and ${RANK_PLURAL[lo]}`;
      }
      return `Two pair — ${RANK_PLURAL[hi]} and ${RANK_PLURAL[lo]}`;
    }
    case CATEGORY.PAIR: {
      const r = tiebreak[0];
      const boardMax = Math.max(...board.map((c) => c.rank));
      if (inHole(r) === 2) {
        return r > boardMax ? `Overpair — ${RANK_PLURAL[r]}` : `Pair of ${RANK_PLURAL[r]} (pocket pair)`;
      }
      if (inHole(r) === 1) {
        return r === boardMax ? `Top pair — ${RANK_PLURAL[r]}` : `Pair of ${RANK_PLURAL[r]}`;
      }
      return `The board's pair of ${RANK_PLURAL[r]}`;
    }
    default:
      return `${RANK_NAME[tiebreak[0]]} high`;
  }
}

// ---------------------------------------------------------------- draws

// Four cards of one suit with at least one of them in your hand — a
// four-flush that's all board belongs to the whole table, not to you.
function hasFlushDraw(all: Card[], hole: Card[]): boolean {
  for (const suit of ["s", "h", "d", "c"] as const) {
    if (all.filter((c) => c.suit === suit).length === 4 && hole.some((c) => c.suit === suit)) {
      return true;
    }
  }
  return false;
}

// Straight draw: some five-rank window holds exactly four of the table's
// ranks, at least one of them yours. Four in a row with both ends live
// is open-ended; anything else (a gap, or a run walled off by the ace)
// is a gutshot.
function straightDraw(all: Card[], hole: Card[]): "open" | "gutshot" | null {
  const present = new Set<number>();
  for (const c of all) {
    present.add(c.rank);
    if (c.rank === 14) present.add(1); // the ace also plays low
  }
  const holeRanks = new Set<number>();
  for (const c of hole) {
    holeRanks.add(c.rank);
    if (c.rank === 14) holeRanks.add(1);
  }
  let gutshot = false;
  for (let lo = 1; lo <= 10; lo++) {
    const have = [lo, lo + 1, lo + 2, lo + 3, lo + 4].filter((r) => present.has(r));
    if (have.length !== 4) continue;
    if (!have.some((r) => holeRanks.has(r))) continue;
    const isRun = have[3] - have[0] === 3;
    if (isRun && have[0] > 1 && have[3] < 14) return "open";
    gutshot = true;
  }
  return gutshot ? "gutshot" : null;
}

// ------------------------------------------------------------------ main

// The read for the viewer's hole cards against 0–5 board cards.
export function handRead(hole: Card[], board: Card[]): string {
  if (hole.length !== 2) return "";
  if (board.length === 0) return preflopRead(hole);

  const all = [...hole, ...board];
  const value = evaluateHand(all);
  const made = madeRead(value.category, value.tiebreak, hole, board);

  const draws: string[] = [];
  if (board.length === 3 || board.length === 4) {
    if (value.category < CATEGORY.FLUSH && hasFlushDraw(all, hole)) {
      draws.push("a flush draw");
    }
    if (value.category < CATEGORY.STRAIGHT) {
      const sd = straightDraw(all, hole);
      if (sd === "open") draws.push("an open-ended straight draw");
      else if (sd === "gutshot") draws.push("a gutshot straight draw");
    }
  }

  // With nothing made, the draws (and any overcards) ARE the story —
  // lead with them instead of a bare "Ace high".
  if (value.category === CATEGORY.HIGH_CARD) {
    const boardMax = Math.max(...board.map((c) => c.rank));
    const phrases = [...draws];
    if (hole.every((c) => c.rank > boardMax)) phrases.push("two overcards");
    return phrases.length > 0 ? capitalize(phrases.join(" + ")) : made;
  }
  return draws.length > 0 ? `${made} + ${draws.join(" + ")}` : made;
}
