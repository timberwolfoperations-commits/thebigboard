// Poker — the server-side table machinery. Everything here runs on
// the service-role client (RLS deny-all on poker_hands means there is
// no other path), and every caller is responsible for having already
// authenticated the user and checked group membership (server actions)
// or the cron secret (the tick route). This module is the ONE place
// that applies actions, deals hands, and ends hands, so a player's tap
// and the timeout sweep can never drift apart.
//
// The clock rules (files/POKER-SPEC.md): first decision of a hand = 8h,
// every later one = 4h; a timeout is an automatic check-or-fold; a
// player who times out 3 times in one hand is AWOL for the rest of it —
// the sweep (and any action that lands action on them) applies their
// timeout immediately instead of handing them another deadline.

import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUser, sendPushToUsers } from "@/lib/notify";
import {
  applyAction,
  blindsForHand,
  nextButton,
  startHand,
  timeoutAction,
  totalPot,
  type Action,
  type HandState,
} from "./engine";
import { deserializeState, serializeState } from "./serialize";
import { deadlineFor, nextDealSlot } from "./schedule";

export type ServiceClient = ReturnType<typeof createServiceClient>;

export const POKER_WINNER_POINTS = 10;
export const STARTING_STACK = 100;
export const MAX_SEATS = 10;
const AWOL_TIMEOUTS = 3;

export interface TableRow {
  id: string;
  group_id: string;
  name: string;
  created_by: string;
  status: "lobby" | "running" | "complete";
  hand_no: number;
  next_deal_at: string | null;
  winner_user_id: string | null;
  created_at: string;
}

export interface SeatRow {
  id: string;
  table_id: string;
  user_id: string;
  seat_no: number;
  stack: number;
  status: "active" | "busted";
}

export interface HandRow {
  id: string;
  table_id: string;
  hand_no: number;
  state: unknown;
  status: "active" | "complete";
  action_deadline_at: string | null;
  timeouts: Record<string, number>;
  created_at: string;
  updated_at: string;
}

// What a stretch of clock work did — the tick route reports this.
export interface FlowStats {
  timeoutsApplied: number;
  handsCompleted: number;
  handsDealt: number;
}

function newStats(): FlowStats {
  return { timeoutsApplied: 0, handsCompleted: 0, handsDealt: 0 };
}

// --------------------------------------------------------- notifications
// Push taps on the shoulder, fired from the settle points below so a
// player's tap and the timeout sweep notify identically — there is no
// second path to forget. lib/notify swallows its own errors and these
// wrappers swallow the rest: a notification can never break a hand.

function tableUrl(table: TableRow): string {
  return `/groups/${table.group_id}/poker/${table.id}`;
}

function fmtDeadlineET(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time} ET`;
}

// The clock just landed on someone who isn't the player who acted.
async function notifyTurn(
  table: TableRow,
  userId: string,
  handNo: number,
  deadlineIso: string,
): Promise<void> {
  try {
    await sendPushToUser(userId, {
      title: `Your move — ${table.name}`,
      body: `Hand ${handNo} · move by ${fmtDeadlineET(deadlineIso)}`,
      url: tableUrl(table),
    });
  } catch {
    // A missed tap is a shame; a broken hand is a bug. Stay silent.
  }
}

// A fresh hand, to everyone dealt into it (a seat with no chips sits
// the hand out and hears about it at the rail instead).
async function notifyDealt(table: TableRow, seats: SeatRow[], handNo: number): Promise<void> {
  try {
    const { smallBlind, bigBlind } = blindsForHand(handNo);
    const dealtIn = seats.filter((s) => s.stack > 0).map((s) => s.user_id);
    if (dealtIn.length === 0) return;
    await sendPushToUsers(dealtIn, {
      title: `Hand ${handNo} dealt — ${table.name}`,
      body: `Blinds ${smallBlind}/${bigBlind}. First decision window: 8 hours.`,
      url: tableUrl(table),
    });
  } catch {
    // Same rule as notifyTurn: never let a tap break the deal.
  }
}

// The tournament just ended — the whole table hears it, rail included.
async function notifyChampion(
  service: ServiceClient,
  table: TableRow,
  seats: SeatRow[],
  winnerUserId: string,
): Promise<void> {
  try {
    const { data } = await service
      .from("profiles")
      .select("display_name")
      .eq("id", winnerUserId)
      .maybeSingle();
    const name =
      (data as { display_name: string | null } | null)?.display_name ?? "Someone";
    await sendPushToUsers(
      seats.map((s) => s.user_id),
      {
        title: `${name} takes ${table.name}`,
        body: `Last one standing — ${POKER_WINNER_POINTS} lifetime points banked.`,
        url: tableUrl(table),
      },
    );
  } catch {
    // Same rule: the award is already written; the tap is a courtesy.
  }
}

// ------------------------------------------------------------- loading

export async function loadTable(service: ServiceClient, tableId: string): Promise<TableRow> {
  const { data, error } = await service
    .from("poker_tables")
    .select("*")
    .eq("id", tableId)
    .single();
  if (error || !data) throw new Error("Poker table not found.");
  return data as TableRow;
}

// Seats in position order — the array index IS the engine seat index
// (seat_no is assigned 0..n-1 at creation and never changes).
export async function loadSeats(service: ServiceClient, tableId: string): Promise<SeatRow[]> {
  const { data, error } = await service
    .from("poker_seats")
    .select("*")
    .eq("table_id", tableId)
    .order("seat_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeatRow[];
}

export async function loadHand(service: ServiceClient, handId: string): Promise<HandRow> {
  const { data, error } = await service
    .from("poker_hands")
    .select("*")
    .eq("id", handId)
    .single();
  if (error || !data) throw new Error("Poker hand not found.");
  return data as HandRow;
}

export async function loadActiveHand(
  service: ServiceClient,
  tableId: string,
): Promise<HandRow | null> {
  const { data, error } = await service
    .from("poker_hands")
    .select("*")
    .eq("table_id", tableId)
    .eq("status", "active")
    .order("hand_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HandRow) ?? null;
}

export async function loadLatestHand(
  service: ServiceClient,
  tableId: string,
): Promise<HandRow | null> {
  const { data, error } = await service
    .from("poker_hands")
    .select("*")
    .eq("table_id", tableId)
    .order("hand_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HandRow) ?? null;
}

// Everyone who has made (or been auto-dealt) a decision in this hand —
// drives the 8h-vs-4h deadline rule. The action log is the truth.
async function actedUserIds(service: ServiceClient, handId: string): Promise<Set<string>> {
  const { data, error } = await service
    .from("poker_actions")
    .select("user_id")
    .eq("hand_id", handId);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

// ------------------------------------------------------------- dealing

// Deal hand `handNo` for a table whose seats carry their current
// stacks. Persists the engine state, sets the first actor's deadline
// (8h rule), and points next_deal_at at the following Mon/Wed/Fri slot.
// A hand can complete the moment it's dealt (everyone all-in on the
// blinds late in a tournament) — that runs through the same hand-end
// processing as any other finish.
export async function dealHand(
  service: ServiceClient,
  table: TableRow,
  seats: SeatRow[],
  handNo: number,
  button: number,
  now: Date,
  stats: FlowStats,
): Promise<HandRow> {
  const stacks = seats.map((s) => s.stack);
  const state = startHand({ stacks, button, handNumber: handNo });

  const { data, error } = await service
    .from("poker_hands")
    .insert({
      table_id: table.id,
      hand_no: handNo,
      state: serializeState(state),
      status: "active",
      action_deadline_at:
        state.toAct === null ? null : deadlineFor(true, now).toISOString(),
      timeouts: {},
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't deal the hand.");
  const hand = data as HandRow;
  stats.handsDealt++;

  const nextDeal = nextDealSlot(now);
  const { error: tErr } = await service
    .from("poker_tables")
    .update({ hand_no: handNo, next_deal_at: nextDeal.toISOString() })
    .eq("id", table.id);
  if (tErr) throw new Error(tErr.message);
  table.hand_no = handNo;
  table.next_deal_at = nextDeal.toISOString();

  await notifyDealt(table, seats, handNo);

  if (state.street === "complete") {
    await processHandEnd(service, table, hand, state, seats, now, stats);
  }
  return hand;
}

// ------------------------------------------------------------ hand end

// Settle a finished hand: bank the final stacks onto the seats, mark
// the busted, and either crown the winner (one stack left — tournament
// over, 10 lifetime points) or line up the next hand: dealt on the
// spot if its slot has already passed, otherwise left for the sweep.
export async function processHandEnd(
  service: ServiceClient,
  table: TableRow,
  hand: HandRow,
  state: HandState,
  seats: SeatRow[],
  now: Date,
  stats: FlowStats,
): Promise<void> {
  const { error: hErr } = await service
    .from("poker_hands")
    .update({
      status: "complete",
      state: serializeState(state),
      action_deadline_at: null,
      updated_at: now.toISOString(),
    })
    .eq("id", hand.id);
  if (hErr) throw new Error(hErr.message);
  hand.status = "complete";
  stats.handsCompleted++;

  for (let i = 0; i < seats.length; i++) {
    const stack = state.seats[i].stack;
    seats[i].stack = stack;
    seats[i].status = stack > 0 ? "active" : "busted";
    const { error } = await service
      .from("poker_seats")
      .update({ stack, status: seats[i].status })
      .eq("id", seats[i].id);
    if (error) throw new Error(error.message);
  }

  const alive = seats.filter((s) => s.stack > 0);
  if (alive.length === 1) {
    const winner = alive[0];
    const { error: tErr } = await service
      .from("poker_tables")
      .update({ status: "complete", winner_user_id: winner.user_id, next_deal_at: null })
      .eq("id", table.id);
    if (tErr) throw new Error(tErr.message);
    table.status = "complete";
    table.winner_user_id = winner.user_id;
    table.next_deal_at = null;

    // One-shot award, same shape as quiz_winners; ignoreDuplicates
    // keeps a retried sweep from ever double-paying.
    const { error: wErr } = await service
      .from("poker_winners")
      .upsert(
        { table_id: table.id, user_id: winner.user_id, points: POKER_WINNER_POINTS },
        { onConflict: "table_id", ignoreDuplicates: true },
      );
    if (wErr) throw new Error(wErr.message);
    await notifyChampion(service, table, seats, winner.user_id);
    return;
  }

  if (!table.next_deal_at) {
    const slot = nextDealSlot(now);
    const { error } = await service
      .from("poker_tables")
      .update({ next_deal_at: slot.toISOString() })
      .eq("id", table.id);
    if (error) throw new Error(error.message);
    table.next_deal_at = slot.toISOString();
    return;
  }

  if (new Date(table.next_deal_at).getTime() <= now.getTime()) {
    const stacks = seats.map((s) => s.stack);
    const button = nextButton(stacks, state.button);
    await dealHand(service, table, seats, table.hand_no + 1, button, now, stats);
  }
  // Otherwise the slot is still ahead — the sweep deals it when it lands.
}

// -------------------------------------------------------- applying play

// Apply ONE action (a player's real decision, or a timeout auto-action)
// to the hand, log it, persist, then settle the clock: skip straight
// past any AWOL player whose turn comes up, and set the next real
// deadline (8h for a player's first decision of the hand, else 4h).
// If the action finished the hand, hand-end processing runs here too.
async function applyAndSettle(
  service: ServiceClient,
  table: TableRow,
  hand: HandRow,
  state: HandState,
  seats: SeatRow[],
  seatIdx: number,
  action: Action,
  isTimeout: boolean,
  now: Date,
  stats: FlowStats,
): Promise<void> {
  const timeouts: Record<string, number> = { ...(hand.timeouts ?? {}) };
  const acted = await actedUserIds(service, hand.id);

  let currentAction: Action | null = action;
  let currentSeat = seatIdx;
  let currentIsTimeout = isTimeout;

  // The loop runs the given action, then keeps applying instant
  // timeout actions while the player on the clock is AWOL (3 timeouts
  // already this hand) — they never get handed a fresh deadline.
  for (let guard = 0; guard < 1000; guard++) {
    if (currentAction === null) break;
    const seat = seats[currentSeat];
    const street = state.street;
    const potBefore = totalPot(state);
    const streetBefore = state.seats[currentSeat].committedStreet;

    applyAction(state, currentSeat, currentAction);

    const chipsIn = totalPot(state) - potBefore;
    const amount =
      currentAction.type === "check" || currentAction.type === "fold"
        ? null
        : currentAction.type === "call"
          ? chipsIn
          : streetBefore + chipsIn; // raise / all-in: the raise-TO total

    const { error: aErr } = await service.from("poker_actions").insert({
      hand_id: hand.id,
      table_id: table.id,
      user_id: seat.user_id,
      seat_no: seat.seat_no,
      street,
      action: currentAction.type,
      amount,
      is_timeout: currentIsTimeout,
    });
    if (aErr) throw new Error(aErr.message);
    acted.add(seat.user_id);
    if (currentIsTimeout) {
      timeouts[seat.user_id] = (timeouts[seat.user_id] ?? 0) + 1;
      stats.timeoutsApplied++;
    }

    if (state.street === "complete" || state.toAct === null) {
      hand.timeouts = timeouts;
      await processHandEnd(service, table, hand, state, seats, now, stats);
      return;
    }

    // Persist after every step, so a crash mid-chain never loses an
    // applied action or leaves the log ahead of the state.
    const { error: uErr } = await service
      .from("poker_hands")
      .update({
        state: serializeState(state),
        timeouts,
        updated_at: now.toISOString(),
      })
      .eq("id", hand.id);
    if (uErr) throw new Error(uErr.message);
    hand.timeouts = timeouts;

    const nextSeat = state.toAct;
    const nextUser = seats[nextSeat].user_id;
    if ((timeouts[nextUser] ?? 0) >= AWOL_TIMEOUTS) {
      currentAction = timeoutAction(state);
      currentSeat = nextSeat;
      currentIsTimeout = true;
      continue;
    }

    const deadline = deadlineFor(!acted.has(nextUser), now);
    const { error: dErr } = await service
      .from("poker_hands")
      .update({ action_deadline_at: deadline.toISOString(), updated_at: now.toISOString() })
      .eq("id", hand.id);
    if (dErr) throw new Error(dErr.message);
    hand.action_deadline_at = deadline.toISOString();
    // The clock settled on a new player — tap them, unless the hand
    // came back around to the player who just acted (heads-up street
    // changes can do that; they're already looking at the table).
    if (nextUser !== seat.user_id) {
      await notifyTurn(table, nextUser, hand.hand_no, deadline.toISOString());
    }
    return;
  }
  throw new Error("Poker clock failed to settle — too many chained actions.");
}

// A player's real decision, from lib/poker-actions.ts after auth +
// turn checks. Returns the flow stats so callers can report.
export async function applyPlayerAction(
  service: ServiceClient,
  table: TableRow,
  hand: HandRow,
  seats: SeatRow[],
  seatIdx: number,
  action: Action,
  now: Date,
): Promise<FlowStats> {
  const state = deserializeState(hand.state);
  const stats = newStats();
  await applyAndSettle(service, table, hand, state, seats, seatIdx, action, false, now, stats);
  return stats;
}

// --------------------------------------------------------------- sweep

// One table's sweep: an overdue actor gets their timeout action (and
// the AWOL chain behind them resolves inside applyAndSettle); a table
// with no live hand whose deal slot has landed gets its next hand.
export async function sweepTable(
  service: ServiceClient,
  table: TableRow,
  now: Date,
): Promise<FlowStats> {
  const stats = newStats();
  if (table.status !== "running") return stats;
  const seats = await loadSeats(service, table.id);
  const hand = await loadActiveHand(service, table.id);

  if (hand) {
    const state = deserializeState(hand.state);
    if (state.street === "complete") {
      // A crash between the engine finishing a hand and the row being
      // marked complete leaves this behind — settle it and move on.
      await processHandEnd(service, table, hand, state, seats, now, stats);
      return stats;
    }
    const overdue =
      hand.action_deadline_at !== null &&
      new Date(hand.action_deadline_at).getTime() <= now.getTime() &&
      state.toAct !== null;
    if (overdue) {
      await applyAndSettle(
        service,
        table,
        hand,
        state,
        seats,
        state.toAct!,
        timeoutAction(state),
        true,
        now,
        stats,
      );
    }
    return stats;
  }

  // No live hand: deal the next one when its slot lands.
  if (!table.next_deal_at) {
    const slot = nextDealSlot(now);
    const { error } = await service
      .from("poker_tables")
      .update({ next_deal_at: slot.toISOString() })
      .eq("id", table.id);
    if (error) throw new Error(error.message);
    table.next_deal_at = slot.toISOString();
    return stats;
  }
  if (new Date(table.next_deal_at).getTime() > now.getTime()) return stats;

  await dealNextHandNow(service, table, now, stats);
  return stats;
}

// Deal the next hand right now for a running table with no live hand —
// the shared core of the sweep's slot deal (above) and the creator's
// deal-next-hand button (lib/poker-actions.ts), so an early hand is
// identical to a scheduled one: same button math off the latest hand,
// same 8h first-decision clock, same dealt notifications. dealHand
// points next_deal_at at the following Mon/Wed/Fri slot, so pulling a
// hand forward never disturbs the schedule behind it. Returns false
// when there's nothing to deal — fewer than two stacks left, a state
// the hand-end flow normally crowns a winner out of before it can
// persist. Callers must have already confirmed no hand is live; the
// (table_id, hand_no) unique constraint is the backstop if two deals
// race anyway.
export async function dealNextHandNow(
  service: ServiceClient,
  table: TableRow,
  now: Date,
  stats: FlowStats = newStats(),
): Promise<boolean> {
  const seats = await loadSeats(service, table.id);
  const stacks = seats.map((s) => s.stack);
  if (stacks.filter((s) => s > 0).length < 2) return false;
  const latest = await loadLatestHand(service, table.id);
  let button: number;
  if (latest) {
    button = nextButton(stacks, deserializeState(latest.state).button);
  } else {
    button = stacks.findIndex((s) => s > 0);
  }
  await dealHand(service, table, seats, table.hand_no + 1, button, now, stats);
  return true;
}

// The whole sweep, for the tick route: every running table, one pass.
export async function sweepAllTables(
  service: ServiceClient,
  now: Date,
): Promise<FlowStats & { tablesSwept: number }> {
  const { data, error } = await service
    .from("poker_tables")
    .select("*")
    .eq("status", "running");
  if (error) throw new Error(error.message);
  const totals = newStats();
  let tablesSwept = 0;
  for (const row of (data ?? []) as TableRow[]) {
    const s = await sweepTable(service, row, now);
    tablesSwept++;
    totals.timeoutsApplied += s.timeoutsApplied;
    totals.handsCompleted += s.handsCompleted;
    totals.handsDealt += s.handsDealt;
  }
  return { ...totals, tablesSwept };
}

// ---------------------------------------------------------- my turns

export interface MyPokerTurn {
  tableId: string;
  tableName: string;
  groupId: string;
  handId: string;
  handNo: number;
  deadlineAt: string | null;
}

// Every table where it's this user's move right now — the dashboard's
// needs-you poker cards. The engine state is read here, on the
// service client, only to learn whose clock is running; the returned
// shape carries NO state beyond that (no cards, no pot, no stacks) —
// table name, hand number, deadline, and the link ids, nothing else.
// Sorted by deadline, soonest first (a hand with no deadline — dealt
// all-in — sorts last).
export async function listMyPokerTurns(
  service: ServiceClient,
  userId: string,
): Promise<MyPokerTurn[]> {
  const { data: mySeats, error } = await service
    .from("poker_seats")
    .select("table_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const tableIds = [...new Set(((mySeats ?? []) as { table_id: string }[]).map((s) => s.table_id))];

  const turns: MyPokerTurn[] = [];
  for (const tableId of tableIds) {
    // A table deleted between the seat read and here shouldn't take
    // the whole dashboard down with it — skip and move on.
    const table = await loadTable(service, tableId).catch(() => null);
    if (!table || table.status !== "running") continue;
    const seats = await loadSeats(service, tableId);
    const mySeat = seats.findIndex((s) => s.user_id === userId);
    if (mySeat < 0) continue;
    const hand = await loadActiveHand(service, tableId);
    if (!hand) continue;
    const state = deserializeState(hand.state);
    if (state.toAct !== mySeat) continue;
    turns.push({
      tableId: table.id,
      tableName: table.name,
      groupId: table.group_id,
      handId: hand.id,
      handNo: hand.hand_no,
      deadlineAt: hand.action_deadline_at,
    });
  }
  turns.sort((a, b) => {
    if (a.deadlineAt === null) return 1;
    if (b.deadlineAt === null) return -1;
    return a.deadlineAt.localeCompare(b.deadlineAt);
  });
  return turns;
}
