"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ------------------------------------------------------------- pick'em pools
// Pick winners, not players. The slate of games comes from the games table
// (API-fed); the commish picks which games are in at creation. Standard
// variant v1: 1 point per correct pick. Picks lock at the pool's lock time,
// and each game's own kickoff locks that game individually.

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

// datetime-local has no timezone; the app is Eastern-first for v1.
function parseEasternLock(raw: string): Date {
  const d = new Date(`${raw}:00-04:00`); // EDT (Oct). Revisit in EST.
  if (isNaN(d.getTime())) throw new Error("That lock time doesn't parse.");
  return d;
}

async function loadPickemPool(poolId: string) {
  const { supabase } = await getUser();
  const { data: pool, error } = await supabase
    .from("pickem_pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (error || !pool) throw new Error("Pool not found.");
  return { supabase, pool: pool as any };
}

export async function createPickemPool(groupId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const week = parseInt(String(formData.get("week") ?? ""), 10);
  const season = parseInt(String(formData.get("season") ?? ""), 10);
  const lockAt = parseEasternLock(String(formData.get("lock_at") ?? ""));

  if (!name) throw new Error("Give your pool a name.");
  if (lockAt.getTime() <= Date.now()) throw new Error("Lock time has to be in the future.");

  const gameIds = [...new Set(formData.getAll("game_ids").map(String))].filter(Boolean);
  if (gameIds.length === 0) throw new Error("Check at least one game for the slate.");

  // Only link games that actually exist in the games table.
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .in("id", gameIds);
  const validIds = new Set(((games ?? []) as any[]).map((g) => g.id));
  const linked = gameIds.filter((id) => validIds.has(id));
  if (linked.length === 0) throw new Error("Those games aren't in the slate anymore.");

  const { data: pool, error } = await supabase
    .from("pickem_pools")
    .insert({
      group_id: groupId,
      name,
      description,
      variant: "standard",
      season: Number.isFinite(season) ? season : null,
      week: Number.isFinite(week) ? week : null,
      lock_at: lockAt.toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: gErr } = await supabase
    .from("pickem_pool_games")
    .insert(linked.map((game_id) => ({ pool_id: pool.id, game_id })));
  if (gErr) throw new Error(gErr.message);

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}/pickem/${pool.id}`);
}

// Pick (or change) your winner for one game. Upsert, so re-tapping just
// moves your pick. Rejected after the pool locks or that game kicks off.
export async function savePickemPick(poolId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  const { pool } = await loadPickemPool(poolId);
  await memberRole(supabase, pool.group_id, user.id);
  if (new Date(pool.lock_at).getTime() <= Date.now()) {
    throw new Error("Picks are locked.");
  }

  const gameId = String(formData.get("game_id") ?? "");
  const picked = String(formData.get("picked_team") ?? "").trim().toUpperCase();
  if (!gameId || !picked) throw new Error("Pick a team.");

  const { data: link } = await supabase
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", poolId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (!link) throw new Error("That game isn't in this pool.");

  const { data: game } = await supabase
    .from("games")
    .select("home_team, away_team, starts_at")
    .eq("id", gameId)
    .single();
  if (!game) throw new Error("Game not found.");
  if (new Date(game.starts_at).getTime() <= Date.now()) {
    throw new Error("That game already kicked off.");
  }
  const teams = [game.home_team, game.away_team].map((t) => String(t ?? "").toUpperCase());
  if (!teams.includes(picked)) throw new Error("Pick one of the two teams.");

  const { error } = await supabase.from("pickem_picks").upsert(
    {
      pool_id: poolId,
      user_id: user.id,
      game_id: gameId,
      picked_team: picked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pool_id,user_id,game_id" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${pool.group_id}/pickem/${poolId}`);
}

// The commish taps once when every game is final: the leaderboard topper
// gets 10 pts + 1 win on the group's lifetime board, same as a roster pool
// win. One-shot — winner_user_id set means it's done.
export async function awardPickemWinner(poolId: string) {
  const { supabase, user } = await getUser();
  const { pool } = await loadPickemPool(poolId);
  if (pool.created_by !== user.id) throw new Error("Only the commish awards the winner.");
  if (new Date(pool.lock_at).getTime() > Date.now()) throw new Error("The pool isn't locked yet.");
  if (pool.winner_user_id) throw new Error("This pool already has a winner.");

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
  const { data: games } = gameIds.length
    ? await supabase.from("games").select("status").in("id", gameIds)
    : { data: [] };
  if (!games || (games as any[]).length === 0 || (games as any[]).some((g: any) => g.status !== "final")) {
    throw new Error("Wait until every game is final.");
  }

  const { computePickemLeaderboard } = await import("./pickem-scoring");
  const board = await computePickemLeaderboard(supabase, poolId);
  const winner = board[0];
  if (!winner) throw new Error("No picks to award.");

  const { error } = await supabase
    .from("pickem_pools")
    .update({ winner_user_id: winner.user_id, winner_points: 10 })
    .eq("id", poolId);
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${pool.group_id}/pickem/${poolId}`);
  revalidatePath(`/groups/${pool.group_id}`);
}
