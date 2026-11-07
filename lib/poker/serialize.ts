// Poker — engine state <-> database. The engine's HandState is plain
// JSON data by design (cards are {rank, suit} values, no class
// instances, no Dates, no functions), so a JSON round-trip is a
// faithful serialization. serializeState still round-trips on the way
// OUT so nothing non-JSON can ever slip into the jsonb column, and
// deserializeState sanity-checks the shape on the way IN so a corrupt
// or hand-edited row fails loudly at load instead of mid-hand.

import type { HandState, Street } from "./engine";

const STREETS: Street[] = ["preflop", "flop", "turn", "river", "complete"];

export function serializeState(state: HandState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

export function deserializeState(raw: unknown): HandState {
  if (typeof raw !== "string" && (typeof raw !== "object" || raw === null)) {
    throw new Error("Stored poker hand state is not an object");
  }
  const state = (typeof raw === "string" ? JSON.parse(raw) : raw) as HandState;
  if (
    typeof state.handNumber !== "number" ||
    !Array.isArray(state.seats) ||
    state.seats.length < 2 ||
    !STREETS.includes(state.street) ||
    !Array.isArray(state.board) ||
    !Array.isArray(state.deck) ||
    !(state.toAct === null || typeof state.toAct === "number") ||
    typeof state.button !== "number"
  ) {
    throw new Error("Stored poker hand state has an unexpected shape");
  }
  return state;
}
