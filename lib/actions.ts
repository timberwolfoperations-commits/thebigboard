"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GRACE_DAYS, AUTO_SETTLE_DAYS } from "@/lib/config";

// ------------------------------------------------------------------ helpers

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

async function memberRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  userId: string
) {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You're not in this group.");
  return data.role as "admin" | "member";
}

export interface BetParticipant {
  user_id: string;
  approved: boolean;
  accepted: boolean;
  display_name: string | null;
}

export interface BetDetail {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  points: number;
  created_by: string;
  invite_token: string;
  status: "pending" | "open" | "awaiting" | "settled" | "disputed" | "void";
  settle_date: string;
  proposed_winner_id: string | null;
  proposed_by: string | null;
  created_at: string;
  participants: BetParticipant[];
}

async function loadBet(betId: string): Promise<BetDetail> {
  const { supabase } = await getUser();
  const { data: bet, error } = await supabase
    .from("bets")
    .select("*")
    .eq("id", betId)
    .single();
  if (error || !bet) throw new Error("Bet not found.");

  const { data: parts } = await supabase
    .from("bet_participants")
    .select("user_id, approved, accepted, profiles(display_name)")
    .eq("bet_id", betId);

  return {
    ...bet,
    participants: ((parts ?? []) as any[]).map((p) => ({
      user_id: p.user_id,
      approved: p.approved,
      accepted: p.accepted,
      display_name: p.profiles?.display_name ?? "Player",
    })),
  };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ------------------------------------------------------------------- groups

export async function createGroup(formData: FormData) {
  const { supabase } = await getUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Give your group a name.");

  const { data, error } = await supabase.rpc("create_group", { p_name: name });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  redirect(`/groups/${row.new_group_id}`);
}

export async function joinGroup(formData: FormData) {
  const { supabase } = await getUser();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) throw new Error("Paste an invite link or code.");

  // Accept either a bare token or a full /join/<token> URL.
  const clean = token.includes("/join/")
    ? token.split("/join/")[1].split(/[?#]/)[0]
    : token;

  const { data, error } = await supabase.rpc("join_group_by_token", {
    p_token: clean,
  });
  if (error) throw new Error(error.message);
  redirect(`/groups/${data}`);
}

// --------------------------------------------------------------------- bets

export async function createBet(groupId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const points =
    Math.max(0, parseInt(String(formData.get("points") ?? "10"), 10)) || 10;
  const settleDate = String(formData.get("settle_date") ?? "");
  const unique = [...new Set(formData.getAll("participants").map(String))];

  if (!title) throw new Error("Your bet needs a title.");
  if (!settleDate) throw new Error("Pick a settle date.");
  if (unique.length < 1) throw new Error("A bet needs at least one person in it.");

  // Everyone in the bet must belong to the group.
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  const memberIds = new Set((members ?? []).map((m: any) => m.user_id));
  for (const pid of unique) {
    if (!memberIds.has(pid)) throw new Error("Everyone in a bet must be in the group.");
  }

  const { data: bet, error } = await supabase
    .from("bets")
    .insert({
      group_id: groupId,
      title,
      description,
      points,
      created_by: user.id,
      settle_date: settleDate,
      status: "pending",
      // 12 URL-safe characters — this bet's own invite link.
      invite_token: randomBytes(9).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // The creator proposed it, so they're in. Everyone else gets an invite
  // to accept — nobody is conscripted into a bet.
  const { error: pErr } = await supabase
    .from("bet_participants")
    .insert(unique.map((uid) => ({ bet_id: bet.id, user_id: uid, accepted: uid === user.id })));
  if (pErr) throw new Error(pErr.message);

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}/bets/${bet.id}`);
}

// Accept a bet invite in one step: joins the group and the bet together,
// landing the newcomer straight in the bet.
export async function acceptBetInvite(token: string) {
  const { supabase } = await getUser();
  const { data, error } = await supabase.rpc("accept_bet_invite", { p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Invalid invite link.");
  revalidatePath(`/groups/${row.new_group_id}`);
  redirect(`/groups/${row.new_group_id}/bets/${row.new_bet_id}`);
}

// Accept or decline a pending bet invite. Accepting when everyone is in
// flips the bet live; declining removes you (voids the bet if <2 remain).
export async function respondToBet(betId: string, accept: boolean) {
  const { supabase } = await getUser();
  const { data: bet } = await supabase
    .from("bets")
    .select("group_id")
    .eq("id", betId)
    .single();
  const { error } = await supabase.rpc("respond_to_bet", {
    p_bet_id: betId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
  if (bet) {
    revalidatePath(`/groups/${bet.group_id}`);
    revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
  }
}

// --------------------------------------------------------------- settlement

function assertParticipant(bet: BetDetail, userId: string) {
  if (!bet.participants.some((p) => p.user_id === userId)) {
    throw new Error("Only people in the bet can do that.");
  }
}

// Any participant proposes who won. Resets everyone's approval switch;
// the proposer auto-approves their own proposal.
export async function proposeOutcome(betId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  const bet = await loadBet(betId);
  assertParticipant(bet, user.id);
  if (bet.status !== "open" && bet.status !== "awaiting") {
    throw new Error("This bet can't be settled right now.");
  }

  const winnerId = String(formData.get("winner_id") ?? "");
  if (!bet.participants.some((p) => p.user_id === winnerId)) {
    throw new Error("The winner has to be someone in the bet.");
  }

  const { error } = await supabase
    .from("bets")
    .update({
      status: "awaiting",
      proposed_winner_id: winnerId,
      proposed_by: user.id,
    })
    .eq("id", betId);
  if (error) throw new Error(error.message);

  await supabase
    .from("bet_participants")
    .update({ approved: false })
    .eq("bet_id", betId);
  await supabase
    .from("bet_participants")
    .update({ approved: true })
    .eq("bet_id", betId)
    .eq("user_id", user.id);

  revalidatePath(`/groups/${bet.group_id}`);
  revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
}

// A participant signs off on the proposed winner. Last approval settles it.
export async function approveSettlement(betId: string) {
  const { supabase, user } = await getUser();
  const bet = await loadBet(betId);
  assertParticipant(bet, user.id);
  if (bet.status !== "awaiting") throw new Error("Nothing to approve right now.");

  const { error } = await supabase
    .from("bet_participants")
    .update({ approved: true })
    .eq("bet_id", betId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  const { data: parts } = await supabase
    .from("bet_participants")
    .select("approved")
    .eq("bet_id", betId);

  if (parts && parts.length > 0 && (parts as any[]).every((p) => p.approved)) {
    await supabase.from("bets").update({ status: "settled" }).eq("id", betId);
  }

  revalidatePath(`/groups/${bet.group_id}`);
  revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
}

// "That's not what happened." Pulls the bet off the deadbeat board until
// an admin sorts it out.
export async function disputeBet(betId: string) {
  const { supabase, user } = await getUser();
  const bet = await loadBet(betId);
  assertParticipant(bet, user.id);
  if (bet.status !== "awaiting") throw new Error("Nothing to dispute right now.");

  const { error } = await supabase
    .from("bets")
    .update({ status: "disputed" })
    .eq("id", betId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${bet.group_id}`);
  revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
}

// ------------------------------------------------------------------- admin

async function requireAdmin(groupId: string) {
  const { supabase, user } = await getUser();
  const role = await memberRole(supabase, groupId, user.id);
  if (role !== "admin") throw new Error("Admins only.");
  return { supabase, user };
}

export async function adminForceSettle(betId: string, formData: FormData) {
  const bet = await loadBet(betId);
  const { supabase, user } = await requireAdmin(bet.group_id);

  if (bet.status !== "open" && bet.status !== "awaiting" && bet.status !== "disputed") {
    throw new Error("Only live bets can be force-settled.");
  }
  const winnerId = String(formData.get("winner_id") ?? "");
  if (!bet.participants.some((p) => p.user_id === winnerId)) {
    throw new Error("The winner has to be someone in the bet.");
  }

  const { error } = await supabase
    .from("bets")
    .update({
      status: "settled",
      proposed_winner_id: winnerId,
      proposed_by: user.id,
    })
    .eq("id", betId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${bet.group_id}`);
  revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
}

export async function adminVoidBet(betId: string) {
  const bet = await loadBet(betId);
  const { supabase } = await requireAdmin(bet.group_id);

  const { error } = await supabase
    .from("bets")
    .update({ status: "void" })
    .eq("id", betId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${bet.group_id}`);
  revalidatePath(`/groups/${bet.group_id}/bets/${betId}`);
}

export async function adminResolveDispute(betId: string, formData: FormData) {
  const bet = await loadBet(betId);
  if (bet.status !== "disputed") throw new Error("This bet isn't disputed.");
  // Reuse force-settle: an admin's word is final.
  await adminForceSettle(betId, formData);
}

// ------------------------------------------- overdue sweep (lazy auto-settle)

// Called when a group page loads. No cron needed: the first visitor after the
// deadline triggers it. Undisputed proposals past AUTO_SETTLE_DAYS settle as
// proposed. Bets nobody proposed stay overdue for the deadbeat board.
export async function settleOverdueBets(groupId: string) {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);

  const { data } = await supabase
    .from("bets")
    .select("id")
    .eq("group_id", groupId)
    .eq("status", "awaiting")
    .lt("settle_date", daysAgo(AUTO_SETTLE_DAYS))
    .not("proposed_winner_id", "is", null);

  for (const b of (data ?? []) as any[]) {
    await supabase.from("bets").update({ status: "settled" }).eq("id", b.id);
  }
  if (data && data.length > 0) revalidatePath(`/groups/${groupId}`);
}
