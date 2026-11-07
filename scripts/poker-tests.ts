// Poker engine tests — run with: npx tsx scripts/poker-tests.ts
// Scripted shoes make every hand deterministic: the engine deals in
// seat order, two rounds, then the board off the front of the shoe.

import { createDeck, parseCards, shuffle, type Card, type Rng } from "../lib/poker/cards";
import { CATEGORY, evaluateHand } from "../lib/poker/evaluate";
import {
  applyAction,
  blindsForHand,
  publicView,
  startHand,
  timeoutAction,
  totalPot,
  type HandState,
} from "../lib/poker/engine";

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

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

function throws(name: string, fn: () => unknown): void {
  try {
    fn();
    check(name, false, "did not throw");
  } catch {
    check(name, true);
  }
}

function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a shoe in the order the engine consumes it: hole cards round
// 1 (seat order), round 2, then the board, then the rest of the deck.
function buildShoe(round1: string, round2: string, board: string): Card[] {
  const used = [...parseCards(round1), ...parseCards(round2), ...parseCards(board)];
  const rest = createDeck().filter(
    (c) => !used.some((u) => u.rank === c.rank && u.suit === c.suit),
  );
  return [...used, ...rest];
}

function stacksOf(state: HandState): number[] {
  return state.seats.map((s) => s.stack);
}

function chipsConserved(name: string, state: HandState, initialTotal: number): void {
  eq(`${name}: chips conserved`, stacksOf(state).reduce((a, b) => a + b, 0), initialTotal);
}

// ------------------------------------------------------------ deck & shuffle

console.log("\nDeck & shuffle");
{
  const deck = createDeck();
  eq("deck has 52 cards", deck.length, 52);
  eq("deck cards are unique", new Set(deck.map((c) => `${c.rank}${c.suit}`)).size, 52);
  const a = shuffle(createDeck(), mulberry32(42));
  const b = shuffle(createDeck(), mulberry32(42));
  eq("same seed shuffles the same", a, b);
  const c = shuffle(createDeck(), mulberry32(7));
  check("different seed shuffles differently", JSON.stringify(a) !== JSON.stringify(c));
  const original = createDeck();
  shuffle(original, mulberry32(1));
  eq("shuffle leaves the input alone", original, createDeck());
}

// ------------------------------------------------------------ blinds ladder

console.log("\nBlinds ladder");
{
  eq("hand 1", blindsForHand(1), { smallBlind: 1, bigBlind: 2 });
  eq("hand 3", blindsForHand(3), { smallBlind: 1, bigBlind: 2 });
  eq("hand 4", blindsForHand(4), { smallBlind: 2, bigBlind: 4 });
  eq("hand 9", blindsForHand(9), { smallBlind: 3, bigBlind: 6 });
  eq("hand 12", blindsForHand(12), { smallBlind: 5, bigBlind: 10 });
  eq("hand 15", blindsForHand(15), { smallBlind: 10, bigBlind: 20 });
  eq("hand 18", blindsForHand(18), { smallBlind: 15, bigBlind: 30 });
  eq("hand 19 hits the cap", blindsForHand(19), { smallBlind: 25, bigBlind: 50 });
  eq("hand 40 still capped", blindsForHand(40), { smallBlind: 25, bigBlind: 50 });
}

// ------------------------------------------------------------ evaluator

console.log("\nEvaluator");
{
  const handsInOrder = [
    "As Ks Qs Js Ts 2d 3c", // straight flush
    "Kc Kd Kh Ks 2d 3c 4h", // quads
    "Qc Qd Qh 2s 2d 5c 9h", // full house
    "Ah Jh 8h 6h 3h Kd Qc", // flush
    "9c 8d 7h 6s 5d Kc 2h", // straight
    "7c 7d 7h Ks 9d 4c 2h", // trips
    "Jc Jd 4h 4s Ad 8c 3h", // two pair
    "Tc Td Ah 8s 6d 4c 2h", // pair
    "Ac Qd 9h 7s 5d 3c 2h", // high card
  ].map((h) => evaluateHand(parseCards(h)));
  eq(
    "categories come out 8 down to 0",
    handsInOrder.map((h) => h.category),
    [8, 7, 6, 5, 4, 3, 2, 1, 0],
  );
  check(
    "every category beats the one below it",
    handsInOrder.every((h, i) => i === 0 || handsInOrder[i - 1].score > h.score),
  );

  const wheel = evaluateHand(parseCards("Ac 2d 3h 4s 5c Kd Qh"));
  const sixHigh = evaluateHand(parseCards("2c 3d 4h 5s 6c Kd Qh"));
  eq("wheel is a straight", wheel.category, CATEGORY.STRAIGHT);
  eq("wheel's high card is the 5", wheel.tiebreak[0], 5);
  check("wheel loses to a 6-high straight", wheel.score < sixHigh.score);
  check("wheel still beats trips", wheel.score > handsInOrder[5].score);

  const kingsAceKicker = evaluateHand(parseCards("Kc Kd Ah 7s 5d 3c 2h"));
  const kingsQueenKicker = evaluateHand(parseCards("Kh Ks Qd 7c 5h 3d 2c"));
  check("ace kicker beats queen kicker", kingsAceKicker.score > kingsQueenKicker.score);

  const kingsFull = evaluateHand(parseCards("Kc Kd Kh 2s 2d 9c 5h"));
  const queensFull = evaluateHand(parseCards("Qc Qd Qh As Ad 9d 5c"));
  check("full house is decided by the trips, not the pair", kingsFull.score > queensFull.score);

  const royalA = evaluateHand(parseCards("As Ks Qs Js Ts 2d 3c"));
  const royalB = evaluateHand(parseCards("Ah Kh Qh Jh Th 4d 5c"));
  eq("identical best fives tie exactly", royalA.score, royalB.score);

  const acesFull = evaluateHand(parseCards("As Ah Ad Kc Kd 2s 3d"));
  eq("best-of-7 finds aces full", [acesFull.category, acesFull.tiebreak], [CATEGORY.FULL_HOUSE, [14, 13]]);
}

// ------------------------------------------------------------ scripted hand to showdown

console.log("\nScripted 4-player hand to showdown");
{
  // Seat 0: A♠ A♥ · Seat 1: K♠ K♥ · Seat 2: 7♦ 2♣ · Seat 3: Q♠ Q♥
  // Board: A♦ K♦ Q♦ 5♠ 9♣ → trip aces beat trip kings beat trip queens.
  const state = startHand({
    stacks: [100, 100, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("As Ks 7d Qs", "Ah Kh 2c Qh", "Ad Kd Qd 5s 9c"),
  });
  eq("action starts after the big blind", state.toAct, 3);
  applyAction(state, 3, { type: "raise", to: 6 });
  applyAction(state, 0, { type: "call" });
  applyAction(state, 1, { type: "call" });
  applyAction(state, 2, { type: "fold" });
  eq("flop is dealt", state.board.length, 3);
  applyAction(state, 1, { type: "check" });
  applyAction(state, 3, { type: "raise", to: 10 }); // a bet, in raise clothing
  applyAction(state, 0, { type: "call" });
  applyAction(state, 1, { type: "fold" });
  applyAction(state, 3, { type: "check" }); // turn
  applyAction(state, 0, { type: "check" });
  applyAction(state, 3, { type: "check" }); // river
  applyAction(state, 0, { type: "raise", to: 20 });
  applyAction(state, 3, { type: "call" });
  eq("hand is complete", state.street, "complete");
  eq("it went to showdown", state.result?.showdown, true);
  eq("pot was 80", totalPot(state), 80);
  eq("seat 0 won it all", state.result?.payouts, { 0: 80 });
  eq("final stacks", stacksOf(state), [144, 94, 98, 64]);
  chipsConserved("showdown hand", state, 400);
  eq(
    "only the showdown hands are revealed",
    Object.keys(state.result?.revealed ?? {}).map(Number).sort(),
    [0, 3],
  );
}

// ------------------------------------------------------------ all-in side pots

console.log("\nAll-in side pots (three different stacks)");
{
  // Seat 0 (30 chips): A♠ A♦ · Seat 1 (100): K♠ K♦ · Seat 2 (100): Q♠ Q♦
  // Dry board — aces take the main pot, kings the side pot.
  const state = startHand({
    stacks: [30, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("As Ks Qs", "Ad Kd Qd", "2c 7h 9s Jc 4d"),
  });
  applyAction(state, 0, { type: "allin" }); // raises to 30, all-in
  applyAction(state, 1, { type: "call" });
  applyAction(state, 2, { type: "raise", to: 80 });
  applyAction(state, 1, { type: "call" });
  for (let street = 0; street < 3; street++) {
    applyAction(state, 1, { type: "check" });
    applyAction(state, 2, { type: "check" });
  }
  eq("hand is complete", state.street, "complete");
  eq(
    "pots sliced by commitment level",
    state.result?.pots.map((p) => p.amount),
    [90, 100],
  );
  eq("main pot to the aces, side pot to the kings", state.result?.payouts, { 0: 90, 1: 100 });
  eq("final stacks", stacksOf(state), [90, 120, 20]);
  chipsConserved("side-pot hand", state, 230);
}

// ------------------------------------------------------------ split pot, odd chip

console.log("\nSplit pot with an odd chip");
{
  // The board is a royal straight — both remaining players play the
  // board and tie. The folded small blind's single chip makes the
  // first pot odd, and the odd chip belongs to the earliest position
  // after the button (seat 1, with the button on seat 2).
  const state = startHand({
    stacks: [100, 100, 100],
    button: 2,
    handNumber: 1,
    deck: buildShoe("2d 4h 6c", "3d 5h 7c", "As Ks Qs Js Ts"),
  });
  applyAction(state, 2, { type: "raise", to: 12 });
  applyAction(state, 0, { type: "fold" }); // the small blind, 1 chip in
  applyAction(state, 1, { type: "call" });
  for (let street = 0; street < 3; street++) {
    applyAction(state, 1, { type: "check" });
    applyAction(state, 2, { type: "check" });
  }
  eq("hand is complete", state.street, "complete");
  eq("pot split 13 / 12 — odd chip to earliest position", state.result?.payouts, { 1: 13, 2: 12 });
  eq("final stacks", stacksOf(state), [99, 101, 100]);
  chipsConserved("split-pot hand", state, 300);
}

// ------------------------------------------------------------ dead money

console.log("\nDead money: everyone folds to the short all-in");
{
  // Seat 2 is all-in for 10 while three folders put in 30 each and the
  // small blind 1. When the flop folds around, the short stack is the
  // last player standing and takes the whole 101 — including the
  // chips above its own level. Dead money never vanishes.
  const state = startHand({
    stacks: [100, 100, 10, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("2c 3c 4c 5c 6c", "7c 8c 9c Tc Jc", "Qc Kc Ac 2d 3d"),
  });
  applyAction(state, 3, { type: "raise", to: 30 });
  applyAction(state, 4, { type: "call" });
  applyAction(state, 0, { type: "call" });
  applyAction(state, 1, { type: "fold" });
  applyAction(state, 2, { type: "call" }); // all-in for 10 total
  applyAction(state, 3, { type: "fold" }); // flop
  applyAction(state, 4, { type: "fold" });
  applyAction(state, 0, { type: "fold" });
  eq("hand ends by folds", [state.street, state.result?.showdown], ["complete", false]);
  eq("short stack takes the dead money too", state.result?.payouts, { 2: 101 });
  eq("final stacks", stacksOf(state), [70, 99, 101, 70, 70]);
  chipsConserved("dead-money hand", state, 410);
}

// ------------------------------------------------------------ heads-up

console.log("\nHeads-up blinds and action order");
{
  const state = startHand({
    stacks: [100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("As Ks", "Ah Kh", "2c 7d 9s Jc 4d"),
  });
  eq("button posts the small blind", state.seats[0].committedStreet, 1);
  eq("other seat posts the big blind", state.seats[1].committedStreet, 2);
  eq("button acts first pre-flop", state.toAct, 0);
  applyAction(state, 0, { type: "call" });
  eq("big blind gets the option", state.toAct, 1);
  applyAction(state, 1, { type: "check" });
  eq("non-button acts first on the flop", state.toAct, 1);
  for (let street = 0; street < 3; street++) {
    applyAction(state, 1, { type: "check" });
    applyAction(state, 0, { type: "check" });
  }
  eq("pair of aces beats pair of kings", state.result?.payouts, { 0: 4 });
  eq("final stacks", stacksOf(state), [102, 98]);
  chipsConserved("heads-up hand", state, 200);
}

// ------------------------------------------------------------ everyone folds

console.log("\nEveryone folds to the big blind");
{
  const state = startHand({
    stacks: [100, 100, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("2c 3c 4c 5c", "6c 7c 8c 9c", "Tc Jc Qc Kc Ac"),
  });
  applyAction(state, 3, { type: "fold" });
  applyAction(state, 0, { type: "fold" });
  applyAction(state, 1, { type: "fold" });
  eq("hand ends immediately", state.street, "complete");
  eq("no showdown happened", state.result?.showdown, false);
  eq("big blind picks up the blinds", state.result?.payouts, { 2: 3 });
  eq("winner's cards stay hidden", state.result?.revealed, {});
  eq("final stacks", stacksOf(state), [100, 99, 101, 100]);
  chipsConserved("fold-out hand", state, 400);
}

// ------------------------------------------------------------ short blind all-in

console.log("\nShort big blind posts all-in for less");
{
  // Hand 7 → blinds 3/6. Seat 2 has a single chip: posts it all-in as
  // the big blind. Callers still owe the full 6, and seat 2 can only
  // win the pot level its chip reached.
  const state = startHand({
    stacks: [100, 100, 1],
    button: 0,
    handNumber: 7,
    deck: buildShoe("Ks Qs As", "Kh Qd Ah", "2c 7d 9s Jc 4d"),
  });
  eq("short blind posted what it had", state.seats[2].committedHand, 1);
  eq("short blind is all-in", state.seats[2].stack, 0);
  eq("the bet to match is still the full blind", state.currentBet, 6);
  applyAction(state, 0, { type: "call" });
  applyAction(state, 1, { type: "call" });
  for (let street = 0; street < 3; street++) {
    applyAction(state, 1, { type: "check" });
    applyAction(state, 0, { type: "check" });
  }
  eq("pots sliced at the short stack's level", state.result?.pots.map((p) => p.amount), [3, 10]);
  eq("aces win the 3-chip main, kings the 10-chip side", state.result?.payouts, { 0: 10, 2: 3 });
  eq("final stacks", stacksOf(state), [104, 94, 3]);
  chipsConserved("short-blind hand", state, 201);
}

// ------------------------------------------------------------ min-raise validation

console.log("\nMin-raise validation");
{
  const state = startHand({
    stacks: [100, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("2c 3c 4c", "5c 6c 7c", "8c 9c Tc Jc Qc"),
  });
  throws("raise of less than the big blind is rejected", () =>
    applyAction(state, 0, { type: "raise", to: 3 }),
  );
  applyAction(state, 0, { type: "raise", to: 10 }); // raise size 8
  applyAction(state, 1, { type: "call" });
  throws("re-raise smaller than the last raise is rejected", () =>
    applyAction(state, 2, { type: "raise", to: 15 }),
  );
  throws("raise beyond the stack is rejected", () =>
    applyAction(state, 2, { type: "raise", to: 500 }),
  );
  applyAction(state, 2, { type: "raise", to: 18 }); // exactly the min — fine
  eq("legal min re-raise went through", state.currentBet, 18);
  throws("acting out of turn is rejected", () => applyAction(state, 2, { type: "fold" }));
}

// ------------------------------------------------------------ timeout action

console.log("\nTimeout action");
{
  const facing = startHand({
    stacks: [100, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("2c 3c 4c", "5c 6c 7c", "8c 9c Tc Jc Qc"),
  });
  eq("facing the big blind, a timeout folds", timeoutAction(facing), { type: "fold" });

  const free = startHand({
    stacks: [100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("As Ks", "Ah Kh", "2c 7d 9s Jc 4d"),
  });
  applyAction(free, 0, { type: "call" }); // now the big blind, bet matched
  eq("with the bet matched, a timeout checks", timeoutAction(free), { type: "check" });
}

// ------------------------------------------------------------ public view secrecy

console.log("\nPublic view secrecy");
{
  const state = startHand({
    stacks: [100, 100, 100],
    button: 0,
    handNumber: 1,
    deck: buildShoe("As Ks Qs", "Ah Kh Qh", "2c 7d 9s Jc 4d"),
  });
  const view = publicView(state, 0);
  eq("viewer sees their own cards", view.seats[0].cards?.map((c) => `${c.rank}${c.suit}`), ["14s", "14h"]);
  eq("other seats' cards are absent, not hidden", view.seats[1].cards, null);
  eq("card counts still show", view.seats[1].cardCount, 2);
  check("the shoe is not in the view", !("deck" in view));
  check(
    "no opponent card leaks anywhere in the payload",
    !JSON.stringify(view).includes('"rank":13'),
  );
}

// ------------------------------------------------------------ fuzz round

console.log("\nFuzz: 200 random hands must finish with chips conserved");
{
  const rng = mulberry32(20261106);
  let allOk = true;
  for (let h = 0; h < 200; h++) {
    const seatCount = 2 + Math.floor(rng() * 8); // 2–9 seats
    const stacks = Array.from({ length: seatCount }, () =>
      rng() < 0.15 ? 0 : 5 + Math.floor(rng() * 120),
    );
    if (stacks.filter((s) => s > 0).length < 2) stacks[0] = stacks[1] = 50;
    const initialTotal = stacks.reduce((a, b) => a + b, 0);
    const button = Math.floor(rng() * seatCount);
    const state = startHand({
      stacks,
      button: stacks[button] > 0 ? button : stacks.findIndex((s) => s > 0),
      handNumber: 1 + Math.floor(rng() * 20),
      rng,
    });
    let guard = 0;
    while (state.street !== "complete" && guard++ < 1000) {
      const seat = state.toAct!;
      const s = state.seats[seat];
      const owed = state.currentBet - s.committedStreet;
      const roll = rng();
      if (roll < 0.25) applyAction(state, seat, { type: "fold" });
      else if (roll < 0.3) applyAction(state, seat, timeoutAction(state));
      else if (owed > 0 && roll < 0.75) applyAction(state, seat, { type: "call" });
      else if (owed === 0 && roll < 0.75) applyAction(state, seat, { type: "check" });
      else if (s.mayRaise && s.stack > owed) {
        const minTo =
          state.currentBet + (state.currentBet === 0 ? state.bigBlind : state.lastRaiseSize);
        const maxTo = s.committedStreet + s.stack;
        const to = Math.min(maxTo, minTo + Math.floor(rng() * 20));
        applyAction(state, seat, { type: "raise", to });
      } else if (owed > 0) applyAction(state, seat, { type: "call" });
      else applyAction(state, seat, { type: "check" });
    }
    const finalTotal = stacksOf(state).reduce((a, b) => a + b, 0);
    const paidOut = Object.values(state.result?.payouts ?? {}).reduce((a, b) => a + b, 0);
    if (
      state.street !== "complete" ||
      finalTotal !== initialTotal ||
      paidOut !== totalPot(state) ||
      state.seats.some((s) => s.stack < 0)
    ) {
      allOk = false;
      console.log(
        `  fuzz hand ${h} broke: street=${state.street} total ${initialTotal}→${finalTotal} paid=${paidOut} pot=${totalPot(state)}`,
      );
    }
  }
  check("all 200 fuzz hands completed, conserved, and paid out in full", allOk);
}

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(`Failing: ${failures.join("; ")}`);
  process.exit(1);
}
