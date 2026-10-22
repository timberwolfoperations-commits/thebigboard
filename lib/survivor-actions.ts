"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSurvivorState, type SurvivorPoolRow } from "./survivor";

// ------------------------------------------------------------- survivor pools
// One pick a week, win and advance, lose and you're out, no team twice.
// Elimination is derived from the games table (lib/survivor.ts) — these
// actions only write pools, entries, and picks.

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

// Playing a pool takes group membership OR a guest seat in that pool
// (open pools, migration 022). Creating pools stays members-only — this
// only gates entry/pick actions on a pool that already exists.
async function assertPoolAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  poolId: string,
  userId: string
) {
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership) return membership.role as "admin" | "member";
  const { data: guest } = await supabase
    .from("pool_guests")
    .select("id")
    .eq("pool_type", "survivor")
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (guest) return "guest" as const;
  throw new Error("You're not in this group.");
}

async function loadSurvivorPool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string
): Promise<SurvivorPoolRow> {
  const { data: pool, error } = await supabase
    .from("survivor_pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (error || !pool) throw new Error("That survivor pool doesn't exist.");
  return pool as SurvivorPoolRow;
}

export async function createSurvivorPool(groupId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);

  const name = String(formData.get("name") ?? "").trim() || "NFL Survivor";
  const isPublic = formData.get("is_public") != null;
  const [seasonRaw, weekRaw] = String(formData.get("start") ?? "").split(":");
  const season = parseInt(seasonRaw ?? "", 10);
  const startWeek = parseInt(weekRaw ?? "", 10);
  if (!Number.isFinite(season) || !Number.isFinite(startWeek)) {
    throw new Error("Pick which week the survivor starts.");
  }

  // The start week has to exist in the (API-fed) games table.
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("sport", "NFL")
    .eq("season", season)
    .eq("week", startWeek)
    .limit(1);
  if (!games || games.length === 0) {
    throw new Error("That week's games aren't loaded yet.");
  }

  const { data: pool, error } = await supabase
    .from("survivor_pools")
    .insert({ group_id: groupId, name, season, start_week: startWeek, is_public: isPublic, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}/survivor/${pool.id}`);
}

export async function joinSurvivorPool(poolId: string) {
  const { supabase, user } = await getUser();
  const pool = await loadSurvivorPool(supabase, poolId);
  await assertPoolAccess(supabase, pool.group_id, poolId, user.id);

  const state = await computeSurvivorState(supabase, pool);
  if (state.firstKickoff && new Date(state.firstKickoff).getTime() <= Date.now()) {
    throw new Error("This survivor already kicked off — entries are closed.");
  }

  const { error } = await supabase
    .from("survivor_entries")
    .insert({ pool_id: poolId, user_id: user.id });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }

  revalidatePath(`/groups/${pool.group_id}/survivor/${poolId}`);
  revalidatePath(`/groups/${pool.group_id}`);
}

export async function saveSurvivorPick(poolId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  const pool = await loadSurvivorPool(supabase, poolId);
  await assertPoolAccess(supabase, pool.group_id, poolId, user.id);

  const gameId = String(formData.get("game_id") ?? "");
  const team = String(formData.get("picked_team") ?? "").toUpperCase();
  if (!gameId || !team) throw new Error("Pick a team.");

  const state = await computeSurvivorState(supabase, pool);
  if (state.decided) throw new Error("This survivor is over.");
  if (state.currentWeek === null) throw new Error("No week is open for picks.");

  const mine = state.entries.find((e) => e.user_id === user.id);
  if (!mine) throw new Error("Join the pool first.");
  if (!mine.alive) throw new Error("You're out — no more picks.");

  const game = (state.gamesByWeek.get(state.currentWeek) ?? []).find((g) => g.id === gameId);
  if (!game) throw new Error("That game isn't on this week's slate.");
  if (game.starts_at && new Date(game.starts_at).getTime() <= Date.now()) {
    throw new Error("That game already kicked off.");
  }
  if (team !== game.home_team && team !== game.away_team) {
    throw new Error("That team isn't in this game.");
  }
  if (mine.usedBeforeCurrent.includes(team)) {
    throw new Error(`You already used ${team} — no team twice.`);
  }

  const { error } = await supabase.from("survivor_picks").upsert(
    {
      entry_id: mine.entry_id,
      week: state.currentWeek,
      game_id: gameId,
      picked_team: team,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entry_id,week" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${pool.group_id}/survivor/${poolId}`);
  revalidatePath("/dashboard");
}
