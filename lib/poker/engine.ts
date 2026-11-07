// Poker — the hand state machine for one table hand. Pure logic, no
// I/O: a later step loads a HandState from the database, applies
// actions, and saves it back. Rules per files/POKER-SPEC.md:
//
//   - No-limit hold'em, tournament stacks, escalating blinds.
//   - Min raise = the size of the last raise. Whole chips only.
//   - All-ins build side pots; split pots split evenly and an odd
//     chip goes to the earliest-position winner.
//   - Timeout = check when no bet is faced, fold when one is.
//
// Secrecy is baked into the shape: hole cards live on the seats, and
// the only way out to a client is publicView(), which strips every
// card except the viewer's own (plus showdown reveals, which are
// public by the rules of the game).

import { createDeck, shuffle, type Card, type Rng } from "./cards";
import { evaluateHand } from "./evaluate";

// ------------------------------------------------------------ blinds

// The tournament ladder from the spec: blinds step up every 3 hands
// so stacks get squeezed and the tournament has to end.
export function blindsForHand(handNumber: number): { smallBlind: number; bigBlind: number } {
  if (handNumber <= 3) return { smallBlind: 1, bigBlind: 2 };
  if (handNumber <= 6) return { smallBlind: 2, bigBlind: 4 };
  if (handNumber <= 9) return { smallBlind: 3, bigBlind: 6 };
  if (handNumber <= 12) return { smallBlind: 5, bigBlind: 10 };
  if (handNumber <= 15) return { smallBlind: 10, bigBlind: 20 };
  if (handNumber <= 18) return { smallBlind: 15, bigBlind: 30 };
  return { smallBlind: 25, bigBlind: 50 };
}

// ------------------------------------------------------------ state

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";

export interface SeatState {
  seat: number; // index in the seats array; seat order is position order
  stack: number; // chips behind, not yet committed this hand
  inHand: boolean; // dealt in (had chips when the hand started)
  folded: boolean;
  cards: Card[]; // hole cards — server-side only, see publicView()
  committedHand: number; // total put in this hand (drives the pots)
  committedStreet: number; // put in on the current street
  acted: boolean; // has acted since the street started / last full raise
  mayRaise: boolean; // false after a short all-in that didn't reopen betting
}

export interface PotResult {
  amount: number;
  eligible: number[]; // seats that could win it (contributed, not folded)
  winners: number[];
}

export interface HandResult {
  showdown: boolean; // false when everyone folded to one player
  pots: PotResult[];
  payouts: Record<number, number>; // seat → chips won (gross, incl. own bets back)
  revealed: Record<number, Card[]>; // showdown hands only — folded cards stay hidden
}

export interface HandState {
  handNumber: number;
  seats: SeatState[];
  button: number; // seat index of the dealer button
  smallBlind: number;
  bigBlind: number;
  street: Street;
  board: Card[];
  deck: Card[]; // the shoe the hand is dealt from — server-side only
  currentBet: number; // the street bet level everyone must match
  lastRaiseSize: number; // size of the last full raise (the min-raise yardstick)
  toAct: number | null; // seat on the clock, or null when the hand is over
  result: HandResult | null;
}

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number } // "to" = total street commitment after the raise
  | { type: "allin" };

// ------------------------------------------------------------ helpers

function liveSeats(state: HandState): SeatState[] {
  return state.seats.filter((s) => s.inHand && !s.folded);
}

export function totalPot(state: HandState): number {
  return state.seats.reduce((sum, s) => sum + s.committedHand, 0);
}

// The next seat with chips, going around from (and excluding) `from`.
// Used for the button, the blinds, and first-to-act scans.
function nextWithChips(state: HandState, from: number): number {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (state.seats[idx].inHand) return idx;
  }
  throw new Error("No seat in the hand");
}

// First seat at or after `start` (wrapping) that still owes a decision.
function findToAct(state: HandState, start: number): number | null {
  const n = state.seats.length;
  for (let i = 0; i < n; i++) {
    const s = state.seats[(start + i) % n];
    if (
      s.inHand &&
      !s.folded &&
      s.stack > 0 &&
      (!s.acted || s.committedStreet < state.currentBet)
    ) {
      return s.seat;
    }
  }
  return null;
}

// ------------------------------------------------------------ starting a hand

export interface StartHandOptions {
  stacks: number[]; // per seat; 0 = busted, sits this one out
  button: number; // seat index; must be a seat with chips
  handNumber: number;
  deck?: Card[]; // injectable shoe (dealt from the front) — tests use this
  rng?: Rng; // used only when no deck is given; defaults to Math.random
}

// The next button: the next seat around with chips.
export function nextButton(stacks: number[], currentButton: number): number {
  const n = stacks.length;
  for (let i = 1; i <= n; i++) {
    const idx = (currentButton + i) % n;
    if (stacks[idx] > 0) return idx;
  }
  throw new Error("No seat with chips for the button");
}

export function startHand(opts: StartHandOptions): HandState {
  const active = opts.stacks.filter((s) => s > 0).length;
  if (active < 2) throw new Error("Need at least two players with chips to deal a hand");
  if (opts.stacks[opts.button] <= 0) throw new Error("The button must be a seat with chips");

  const { smallBlind, bigBlind } = blindsForHand(opts.handNumber);
  const seats: SeatState[] = opts.stacks.map((stack, i) => ({
    seat: i,
    stack,
    inHand: stack > 0,
    folded: false,
    cards: [],
    committedHand: 0,
    committedStreet: 0,
    acted: false,
    mayRaise: true,
  }));

  const state: HandState = {
    handNumber: opts.handNumber,
    seats,
    button: opts.button,
    smallBlind,
    bigBlind,
    street: "preflop",
    board: [],
    deck: opts.deck ? opts.deck.slice() : shuffle(createDeck(), opts.rng ?? Math.random),
    currentBet: 0,
    lastRaiseSize: bigBlind,
    toAct: null,
    result: null,
  };

  // Deal two cards to each live seat, one at a time in seat order.
  // (Physical dealing order doesn't matter — the shoe is shuffled —
  // and a fixed order keeps scripted test shoes readable.)
  const inSeats = seats.filter((s) => s.inHand);
  for (let round = 0; round < 2; round++) {
    for (const s of inSeats) s.cards.push(draw(state));
  }

  // Post the blinds. Heads-up is the special case: the button posts
  // the small blind and acts first pre-flop. With 3+ players the two
  // seats after the button post, and action starts after the big blind.
  // A stack smaller than the blind posts what it has and is all-in.
  let firstToAct: number;
  if (inSeats.length === 2) {
    const other = nextWithChips(state, state.button);
    postBlind(state, state.button, smallBlind);
    postBlind(state, other, bigBlind);
    firstToAct = state.button;
  } else {
    const sb = nextWithChips(state, state.button);
    const bb = nextWithChips(state, sb);
    postBlind(state, sb, smallBlind);
    postBlind(state, bb, bigBlind);
    firstToAct = nextWithChips(state, bb);
  }
  // The bet to match is the full big blind, even if the big blind
  // posted short (all-in for less) — callers still owe the whole
  // blind; the short poster simply can't win past their own level
  // when the pots are sliced.
  state.currentBet = bigBlind;

  settle(state, firstToAct);
  return state;
}

function draw(state: HandState): Card {
  const card = state.deck.shift();
  if (!card) throw new Error("The shoe ran out of cards");
  return card;
}

function postBlind(state: HandState, seatIdx: number, blind: number): void {
  const s = state.seats[seatIdx];
  const amount = Math.min(blind, s.stack);
  s.stack -= amount;
  s.committedStreet += amount;
  s.committedHand += amount;
}

// ------------------------------------------------------------ actions

function commit(state: HandState, s: SeatState, amount: number): void {
  const put = Math.min(amount, s.stack);
  s.stack -= put;
  s.committedStreet += put;
  s.committedHand += put;
}

export function applyAction(state: HandState, seatIdx: number, action: Action): HandState {
  if (state.street === "complete") throw new Error("The hand is over");
  if (state.toAct !== seatIdx) throw new Error(`It is not seat ${seatIdx}'s turn`);
  const s = state.seats[seatIdx];
  const owed = state.currentBet - s.committedStreet;

  switch (action.type) {
    case "fold": {
      s.folded = true;
      s.acted = true;
      break;
    }
    case "check": {
      if (owed > 0) throw new Error("Cannot check — there is a bet to face");
      s.acted = true;
      break;
    }
    case "call": {
      if (owed <= 0) throw new Error("Nothing to call — check or raise");
      commit(state, s, owed); // a short stack calls all-in for less
      s.acted = true;
      break;
    }
    case "allin": {
      const to = s.committedStreet + s.stack;
      if (to <= state.currentBet) {
        // All-in at or below the bet is just a call for everything.
        commit(state, s, s.stack);
        s.acted = true;
      } else {
        raiseTo(state, s, to);
      }
      break;
    }
    case "raise": {
      raiseTo(state, s, action.to);
      break;
    }
  }

  state.toAct = null;
  settle(state, nextSeatIndex(state, seatIdx));
  return state;
}

function nextSeatIndex(state: HandState, from: number): number {
  return (from + 1) % state.seats.length;
}

// Raise the street bet level to `to` (the raiser's total street
// commitment after the raise). Enforces the min-raise: a raise must
// add at least the last raise size on top of the current bet —
// unless the raiser is all-in for less, which is always allowed but
// does not reopen betting for players who already acted.
function raiseTo(state: HandState, s: SeatState, to: number): void {
  if (!s.mayRaise) throw new Error("Betting was not reopened — call or fold");
  if (to <= state.currentBet) throw new Error("A raise must exceed the current bet");
  const maxTo = s.committedStreet + s.stack;
  if (to > maxTo) throw new Error("Cannot raise beyond your stack");
  const increment = to - state.currentBet;
  const isAllIn = to === maxTo;
  if (increment < state.lastRaiseSize && !isAllIn) {
    throw new Error(
      `Raise too small — minimum is to ${state.currentBet + state.lastRaiseSize}`,
    );
  }

  commit(state, s, to - s.committedStreet);
  state.currentBet = to;
  s.acted = true;

  if (increment >= state.lastRaiseSize) {
    // A full raise: everyone else owes a fresh decision, and anyone
    // may raise again.
    state.lastRaiseSize = increment;
    for (const other of state.seats) {
      if (other.seat !== s.seat && other.inHand && !other.folded) {
        other.acted = false;
        other.mayRaise = true;
      }
    }
  } else {
    // A short all-in raise: players who already acted may only call
    // or fold the difference; players yet to act keep all options.
    for (const other of state.seats) {
      if (other.seat !== s.seat && other.inHand && !other.folded && other.acted) {
        other.mayRaise = false;
      }
    }
  }
}

// The timeout rule from the spec: if no bet is faced, check; if one
// is, fold. Returns the action — the caller applies it.
export function timeoutAction(state: HandState): Action {
  if (state.toAct === null) throw new Error("Nobody is on the clock");
  const s = state.seats[state.toAct];
  return s.committedStreet < state.currentBet ? { type: "fold" } : { type: "check" };
}

// ------------------------------------------------------------ progression

// Move the hand forward until someone owes a decision or the hand is
// over: end streets, deal board cards, run out the board when nobody
// left can bet, and settle the pots at the end.
function settle(state: HandState, scanFrom: number): void {
  for (;;) {
    const live = liveSeats(state);
    if (live.length === 1) {
      finishByFold(state, live[0]);
      return;
    }

    const next = findToAct(state, scanFrom);
    if (next !== null) {
      state.toAct = next;
      return;
    }

    // Nobody owes a decision: the street is done.
    if (state.street === "river") {
      finishByShowdown(state);
      return;
    }
    advanceStreet(state);

    // If at most one live player still has chips, no more betting is
    // possible — deal the board out and go straight to showdown.
    const canBet = liveSeats(state).filter((s) => s.stack > 0).length;
    if (canBet <= 1) {
      while (state.board.length < 5) state.board.push(draw(state));
      finishByShowdown(state);
      return;
    }
    scanFrom = nextSeatIndex(state, state.button);
  }
}

function advanceStreet(state: HandState): void {
  if (state.street === "preflop") {
    state.board.push(draw(state), draw(state), draw(state));
    state.street = "flop";
  } else if (state.street === "flop") {
    state.board.push(draw(state));
    state.street = "turn";
  } else if (state.street === "turn") {
    state.board.push(draw(state));
    state.street = "river";
  } else {
    throw new Error(`Cannot advance past ${state.street}`);
  }
  for (const s of state.seats) {
    s.committedStreet = 0;
    s.acted = false;
    s.mayRaise = true;
  }
  state.currentBet = 0;
  state.lastRaiseSize = state.bigBlind;
}

// ------------------------------------------------------------ settling pots

// Slice everyone's hand commitments into pots by level: each distinct
// commitment level forms a pot from the players who reached it. This
// is the standard side-pot construction — a short all-in is only in
// the pots its chips actually reached.
//
// One wrinkle: chips from players who later folded are dead money.
// They stay in the middle and must be won by somebody — most plainly
// when everyone folds to a player who put in less than the folders
// did. So a level whose contributors have all folded merges down
// into the pot below it instead of vanishing. (The lowest level
// always has a live player in it: staying in a hand costs at least
// the big blind, so every survivor contributed something.)
function buildPots(state: HandState): { amount: number; eligible: number[] }[] {
  const levels = [...new Set(state.seats.filter((s) => s.committedHand > 0).map((s) => s.committedHand))].sort(
    (a, b) => a - b,
  );
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const contributors = state.seats.filter((s) => s.committedHand >= level);
    const amount = (level - prev) * contributors.length;
    const eligible = contributors.filter((s) => !s.folded).map((s) => s.seat);
    if (amount > 0 && eligible.length > 0) {
      pots.push({ amount, eligible });
    } else if (amount > 0 && pots.length > 0) {
      pots[pots.length - 1].amount += amount; // dead money rolls down
    }
    prev = level;
  }
  return pots;
}

// Winners in "earliest position" order: start just after the button
// and go around — that's who receives odd split-pot chips first.
function byPosition(state: HandState, seats: number[]): number[] {
  const n = state.seats.length;
  return seats.slice().sort((a, b) => {
    const da = (a - state.button - 1 + n * 2) % n;
    const db = (b - state.button - 1 + n * 2) % n;
    return da - db;
  });
}

function payOut(
  state: HandState,
  pots: { amount: number; eligible: number[]; winners: number[] }[],
  showdown: boolean,
  revealed: Record<number, Card[]>,
): void {
  const payouts: Record<number, number> = {};
  for (const pot of pots) {
    const share = Math.floor(pot.amount / pot.winners.length);
    let odd = pot.amount - share * pot.winners.length;
    for (const winner of byPosition(state, pot.winners)) {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      payouts[winner] = (payouts[winner] ?? 0) + share + extra;
    }
  }
  for (const [seatIdx, chips] of Object.entries(payouts)) {
    state.seats[Number(seatIdx)].stack += chips;
  }
  state.result = { showdown, pots, payouts, revealed };
  state.street = "complete";
  state.toAct = null;
}

function finishByFold(state: HandState, winner: SeatState): void {
  const pots = buildPots(state).map((p) => ({ ...p, winners: [winner.seat] }));
  payOut(state, pots, false, {}); // the winner's cards are never shown
}

function finishByShowdown(state: HandState): void {
  const live = liveSeats(state);
  const values = new Map(live.map((s) => [s.seat, evaluateHand([...s.cards, ...state.board])]));
  const pots = buildPots(state).map((p) => {
    let best = -1;
    for (const seatIdx of p.eligible) best = Math.max(best, values.get(seatIdx)!.score);
    return { ...p, winners: p.eligible.filter((seatIdx) => values.get(seatIdx)!.score === best) };
  });
  // Only the hands that reached showdown are revealed.
  const revealed: Record<number, Card[]> = {};
  for (const s of live) revealed[s.seat] = s.cards;
  payOut(state, pots, true, revealed);
}

// ------------------------------------------------------------ the public view

export interface PublicSeatView {
  seat: number;
  stack: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  committedHand: number;
  committedStreet: number;
  cardCount: number;
  cards: Card[] | null; // the viewer's own cards; null for everyone else
}

export interface PublicHandView {
  handNumber: number;
  street: Street;
  button: number;
  smallBlind: number;
  bigBlind: number;
  board: Card[];
  pot: number;
  currentBet: number;
  toAct: number | null;
  seats: PublicSeatView[];
  result: HandResult | null;
}

// The ONLY shape a client should ever see. Another player's hole
// cards are not merely hidden here — they are absent from the object,
// so nothing downstream can leak them. (Showdown reveals ride along
// in result.revealed; those cards are public by the rules.)
export function publicView(state: HandState, viewerSeat: number): PublicHandView {
  return {
    handNumber: state.handNumber,
    street: state.street,
    button: state.button,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    board: state.board.slice(),
    pot: totalPot(state),
    currentBet: state.currentBet,
    toAct: state.toAct,
    seats: state.seats.map((s) => ({
      seat: s.seat,
      stack: s.stack,
      inHand: s.inHand,
      folded: s.folded,
      allIn: s.inHand && !s.folded && s.stack === 0,
      committedHand: s.committedHand,
      committedStreet: s.committedStreet,
      cardCount: s.cards.length,
      cards: s.seat === viewerSeat && s.inHand ? s.cards.slice() : null,
    })),
    result: state.result,
  };
}
