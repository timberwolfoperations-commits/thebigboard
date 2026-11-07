// Poker — best-5-of-7 hand evaluator. Pure logic, no I/O.
//
// A hand's strength is packed into one number so two hands compare
// with a single ">": the category (0–8) in the high digits, then up
// to five tie-break ranks packed base-15 below it. Equal numbers mean
// an exact tie — the tied players really do have the same best five.

import type { Card } from "./cards";

// Categories, weakest to strongest. The numeric order IS the ranking.
export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export const CATEGORY_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

export interface HandValue {
  score: number; // compare with > / === only
  category: number; // one of CATEGORY
  name: string;
  tiebreak: number[]; // ranks that decided it, most important first
}

// Pack category + tie-break ranks into one comparable number.
function pack(category: number, tiebreak: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 15 + (tiebreak[i] ?? 0);
  }
  return score;
}

function value(category: number, tiebreak: number[]): HandValue {
  return { score: pack(category, tiebreak), category, name: CATEGORY_NAMES[category], tiebreak };
}

// Score exactly five cards.
function evaluateFive(cards: Card[]): HandValue {
  const ranksDesc = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);

  // Straight: five distinct ranks in a run. The wheel (A-2-3-4-5)
  // counts, with the 5 as its high card — the ace plays low.
  const distinct = [...new Set(ranksDesc)];
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    else if (distinct[0] === 14 && distinct[1] === 5) straightHigh = 5; // wheel
  }

  // Rank groups, ordered by count then rank: [ [count, rank], … ]
  // e.g. kings full of twos → [ [3, 13], [2, 2] ].
  const counts = new Map<number, number>();
  for (const r of ranksDesc) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (straightHigh && flush) return value(CATEGORY.STRAIGHT_FLUSH, [straightHigh]);
  if (groups[0].count === 4) return value(CATEGORY.QUADS, [groups[0].rank, groups[1].rank]);
  if (groups[0].count === 3 && groups[1].count === 2) {
    return value(CATEGORY.FULL_HOUSE, [groups[0].rank, groups[1].rank]);
  }
  if (flush) return value(CATEGORY.FLUSH, ranksDesc);
  if (straightHigh) return value(CATEGORY.STRAIGHT, [straightHigh]);
  if (groups[0].count === 3) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return value(CATEGORY.TRIPS, [groups[0].rank, ...kickers]);
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = groups.slice(0, 2).map((g) => g.rank).sort((a, b) => b - a);
    return value(CATEGORY.TWO_PAIR, [...pairs, groups[2].rank]);
  }
  if (groups[0].count === 2) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return value(CATEGORY.PAIR, [groups[0].rank, ...kickers]);
  }
  return value(CATEGORY.HIGH_CARD, ranksDesc);
}

// Evaluate 5, 6 or 7 cards: try every 5-card subset (21 at most) and
// keep the best. Simple beats clever here — it's plenty fast and the
// brute force is its own proof.
export function evaluateHand(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateHand needs 5–7 cards, got ${cards.length}`);
  }
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}
