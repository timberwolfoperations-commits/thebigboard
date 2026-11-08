"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertCanCreate } from "@/lib/commissioner";
import { publicView, type Action, type PublicHandView } from "@/lib/poker/engine";
import { deserializeState } from "@/lib/poker/serialize";
import {
  MAX_SEATS,
  STARTING_STACK,
  applyPlayerAction,
  dealHand,
  dealNextHandNow,
  loadActiveHand,
  loadHand,
  loadLatestHand,
  loadSeats,
  loadTable,
  type FlowStats,
  type SeatRow,
  type TableRow,
} from "@/lib/poker/server";

// ------------------------------------------------------------- slow poker
// Tournament hold'em on a clock (files/POKER-SPEC.md): the whole group
// is seated, a hand is dealt every ~2 days, decisions get 8h (first of
// the hand) or 4h (the rest), and a timeout is an automatic
// check-or-fold applied by the /api/poker/tick sweep.
//
// Secrecy: poker_hands is deny-all under RLS (migration 027) — the
// engine state in it holds EVERY player's hole cards and the undealt
// shoe. The only reads of it happen here and in lib/poker/server.ts,
// through the service-role client, after the session client has
// authenticated the user and verified group membership. What reaches a
// client is the engine's publicView for that caller: their own cards,
// everyone else's card COUNTS. Never anything else.

type SessionClient = Awaited<ReturnType<typeof createClient>>;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

// Same gate as quiz creation: any group member; non-members get bounced.
async function memberRole(supabase: SessionClient, groupId: string, userId: string) {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You're not in this group.");
  return data.role as "admin" | "member";
}

// ------------------------------------------------------------------ types

export interface PokerActionInput {
  type: "fold" | "check" | "call" | "raise" | "allin";
  to?: number; // raise only: total street commitment after the raise
}

export interface PokerSeatView extends SeatRow {
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PokerActionLogRow {
  id: string;
  userId: string;
  seatNo: number;
  street: string;
  action: string;
  amount: number | null;
  isTimeout: boolean;
  createdAt: string;
}

export interface PokerTableView {
  table: TableRow;
  seats: PokerSeatView[];
  standings: PokerSeatView[]; // seats sorted by stack, biggest first
  mySeatNo: number | null; // null when the viewer isn't seated
  handId: string | null; // the latest hand's row id — act() needs it
  hand: PublicHandView | null; // the latest hand, public-viewed for the caller
  handStatus: "active" | "complete" | null;
  isTableCreator: boolean; // gates the deal-next-hand button
  actionDeadlineAt: string | null;
  timeouts: Record<string, number>;
  actionLog: PokerActionLogRow[]; // decisions in the latest hand, in order
}

// ----------------------------------------------------------------- create

export interface CreatePokerTableResult {
  tableId: string;
  seatedCount: number;
  capped: boolean; // true when the group had more than MAX_SEATS members
}

// Start a table for a group: EVERY current member is seated (stable
// order — longest-standing member first), 100 chips each, and hand 1
// is dealt on the spot. Defaults are pre-filled per the spec; the only
// input is an optional name.
export async function createPokerTable(
  groupId: string,
  name?: string,
): Promise<CreatePokerTableResult> {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);
  assertCanCreate(user);

  const { data: memberRows, error: mErr } = await supabase
    .from("group_members")
    .select("user_id, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true })
    .order("user_id", { ascending: true });
  if (mErr) throw new Error(mErr.message);
  const members = (memberRows ?? []) as { user_id: string }[];
  if (members.length < 2) {
    throw new Error("Poker needs at least two players — invite someone to the group first.");
  }
  const capped = members.length > MAX_SEATS;
  const seated = members.slice(0, MAX_SEATS);

  const service = createServiceClient();
  const now = new Date();
  const { data: tableData, error: tErr } = await service
    .from("poker_tables")
    .insert({
      group_id: groupId,
      name: (name ?? "").trim() || "Poker Night",
      created_by: user.id,
      status: "running",
      hand_no: 0,
      next_deal_at: null,
    })
    .select("*")
    .single();
  if (tErr || !tableData) throw new Error(tErr?.message ?? "Couldn't create the table.");
  const table = tableData as TableRow;

  try {
    const { error: sErr } = await service.from("poker_seats").insert(
      seated.map((m, i) => ({
        table_id: table.id,
        user_id: m.user_id,
        seat_no: i,
        stack: STARTING_STACK,
        status: "active",
      })),
    );
    if (sErr) throw new Error(sErr.message);

    const seats = await loadSeats(service, table.id);
    const stats: FlowStats = { timeoutsApplied: 0, handsCompleted: 0, handsDealt: 0 };
    await dealHand(service, table, seats, 1, 0, now, stats);
  } catch (e) {
    // Don't leave a seat-less or hand-less table behind (cascades clean
    // up the seats/hands with it).
    await service.from("poker_tables").delete().eq("id", table.id);
    throw e;
  }

  revalidatePath(`/groups/${groupId}`);
  return { tableId: table.id, seatedCount: seated.length, capped };
}

// -------------------------------------------------------------------- act

function toEngineAction(input: PokerActionInput): Action {
  switch (input?.type) {
    case "fold":
      return { type: "fold" };
    case "check":
      return { type: "check" };
    case "call":
      return { type: "call" };
    case "allin":
      return { type: "allin" };
    case "raise": {
      const to = Number(input.to);
      if (!Number.isInteger(to) || to <= 0) {
        throw new Error("A raise needs a whole-chip amount to raise to.");
      }
      return { type: "raise", to };
    }
    default:
      throw new Error("That isn't a poker action.");
  }
}

// Make your decision. You must be the seat the hand is waiting on —
// the engine enforces the rules (min raise, can't check a bet), this
// enforces the people (membership, seat, turn).
export async function act(handId: string, input: PokerActionInput): Promise<PokerTableView> {
  const { supabase, user } = await getUser();
  const service = createServiceClient();

  const hand = await loadHand(service, handId);
  if (hand.status !== "active") throw new Error("That hand is over.");
  const table = await loadTable(service, hand.table_id);
  if (table.status !== "running") throw new Error("This table has finished.");
  await memberRole(supabase, table.group_id, user.id);

  const seats = await loadSeats(service, table.id);
  const mySeat = seats.findIndex((s) => s.user_id === user.id);
  if (mySeat < 0) throw new Error("You're not seated at this table.");

  const state = deserializeState(hand.state);
  if (state.toAct === null) throw new Error("That hand is over.");
  if (state.toAct !== mySeat) throw new Error("It's not your turn yet.");

  await applyPlayerAction(
    service,
    table,
    hand,
    seats,
    mySeat,
    toEngineAction(input),
    new Date(),
  );

  revalidatePath(`/groups/${table.group_id}`);
  return buildView(service, table, user.id);
}

// ------------------------------------------------------------- deal now

// Pull the next hand forward — the table creator's button on the
// between-hands view. Creator-only by design: dealing starts an 8h
// first-decision clock for every seat, so the call belongs to whoever
// started the table. Only between hands; the deal itself is the
// sweep's own path (dealNextHandNow), so an early hand is dealt, timed
// and announced exactly like a scheduled one, and the Mon/Wed/Fri slot
// stays lined up behind it.
export async function dealNextHand(tableId: string): Promise<PokerTableView> {
  const { supabase, user } = await getUser();
  const service = createServiceClient();
  const table = await loadTable(service, tableId);
  await memberRole(supabase, table.group_id, user.id);
  if (table.created_by !== user.id) {
    throw new Error("Only the player who started this table can deal a hand early.");
  }
  if (table.status !== "running") throw new Error("This table has finished.");
  if (await loadActiveHand(service, table.id)) {
    throw new Error("A hand is already live at this table.");
  }
  try {
    await dealNextHandNow(service, table, new Date());
  } catch (e) {
    // The sweep (or a double-tap) dealt first: the (table_id, hand_no)
    // unique constraint turns the losing insert away, and the table
    // simply shows the fresh hand — not an error worth surfacing.
    if (!String(e instanceof Error ? e.message : e).includes("duplicate key")) throw e;
  }

  revalidatePath(`/groups/${table.group_id}`);
  revalidatePath(`/groups/${table.group_id}/poker/${table.id}`);
  return buildView(service, table, user.id);
}

// ------------------------------------------------------------------- view

async function buildView(
  service: ReturnType<typeof createServiceClient>,
  table: TableRow,
  viewerId: string,
): Promise<PokerTableView> {
  const seats = await loadSeats(service, table.id);

  const { data: profileRows } = await service
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      seats.map((s) => s.user_id),
    );
  const profiles = new Map(
    ((profileRows ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  const seatViews: PokerSeatView[] = seats.map((s) => ({
    ...s,
    displayName: profiles.get(s.user_id)?.display_name ?? null,
    avatarUrl: profiles.get(s.user_id)?.avatar_url ?? null,
  }));
  const standings = seatViews.slice().sort((a, b) => b.stack - a.stack || a.seat_no - b.seat_no);
  const mySeatNo = seats.findIndex((s) => s.user_id === viewerId);

  const latest = (await loadActiveHand(service, table.id)) ?? (await loadLatestHand(service, table.id));
  let hand: PublicHandView | null = null;
  let actionLog: PokerActionLogRow[] = [];
  if (latest) {
    // publicView with viewerSeat -1 (a member who isn't seated) deals
    // them nobody's cards — every seat's cards stay null.
    hand = publicView(deserializeState(latest.state), mySeatNo);
    const { data: logRows, error } = await service
      .from("poker_actions")
      .select("*")
      .eq("hand_id", latest.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    actionLog = ((logRows ?? []) as any[]).map((r) => ({
      id: r.id,
      userId: r.user_id,
      seatNo: r.seat_no,
      street: r.street,
      action: r.action,
      amount: r.amount,
      isTimeout: Boolean(r.is_timeout),
      createdAt: r.created_at,
    }));
  }

  return {
    table,
    seats: seatViews,
    standings,
    mySeatNo: mySeatNo >= 0 ? mySeatNo : null,
    handId: latest?.id ?? null,
    hand,
    handStatus: latest?.status ?? null,
    isTableCreator: table.created_by === viewerId,
    actionDeadlineAt: latest?.status === "active" ? latest.action_deadline_at : null,
    timeouts: latest?.timeouts ?? {},
    actionLog,
  };
}

// Everything a table page is allowed to show this member — and nothing
// more (see the secrecy note at the top).
export async function getPokerTableView(tableId: string): Promise<PokerTableView> {
  const { supabase, user } = await getUser();
  const service = createServiceClient();
  const table = await loadTable(service, tableId);
  await memberRole(supabase, table.group_id, user.id);
  return buildView(service, table, user.id);
}
