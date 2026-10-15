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
  const variant = String(formData.get("variant") ?? "standard");

  if (!name) throw new Error("Give your pool a name.");
  if (!["standard", "over_under"].includes(variant)) {
    throw new Error("That variant isn't playable yet.");
  }
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
      variant,
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

// ------------------------------------------------- over/under props
// The commish sets the prop lines any time before lock. Replace-on-save —
// simplest semantics, so set them before anyone picks (saving wipes the
// old lines, and their picks go with them via cascade).
export async function setPickemLines(poolId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  const { pool } = await loadPickemPool(poolId);
  if (pool.created_by !== user.id) throw new Error("Only the commish sets the lines.");
  if (pool.variant !== "over_under") throw new Error("This pool isn't over/under.");
  if (new Date(pool.lock_at).getTime() <= Date.now()) throw new Error("Picks are locked.");

  let parsed: any[];
  try {
    parsed = JSON.parse(String(formData.get("lines") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("bad shape");
  } catch {
    throw new Error("Those lines didn't parse.");
  }

  const { VALID_PROP_KEYS } = await import("./prop-stats");
  const clean: any[] = [];
  for (const l of parsed) {
    const player_name = String(l?.player_name ?? "").trim();
    const team = String(l?.team ?? "").trim().toUpperCase();
    const stat_key = String(l?.stat_key ?? "").trim();
    const line = Number(l?.line);
    if (!player_name || !stat_key || !Number.isFinite(line)) continue; // skip blank rows
    if (!VALID_PROP_KEYS.has(stat_key)) throw new Error(`"${stat_key}" isn't a settable stat.`);
    clean.push({ pool_id: poolId, player_name, team, stat_key, line });
  }
  if (clean.length === 0) throw new Error("Add at least one line.");

  const { error: dErr } = await supabase.from("pickem_lines").delete().eq("pool_id", poolId);
  if (dErr) throw new Error(dErr.message);
  const { error: iErr } = await supabase.from("pickem_lines").insert(clean);
  if (iErr) throw new Error(iErr.message);

  revalidatePath(`/groups/${pool.group_id}/pickem/${poolId}`);
}

// ------------------------------------------------- recent prop players
// Distinct players with stat lines in the pool's teams' recent finals —
// real participants, not the 40-man roster. Feeds the lines editor's
// player picker. Empty array when there are no recent finals (the editor
// then behaves as a plain text field). Read-only.
export async function getRecentPropPlayers(
  poolId: string
): Promise<{ player_name: string; team: string }[]> {
  const { supabase } = await getUser();
  const { pool } = await loadPickemPool(poolId);

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
  if (gameIds.length === 0) return [];

  const { data: slateGames } = await supabase
    .from("games")
    .select("home_team, away_team, sport")
    .in("id", gameIds);
  const teams = [
    ...new Set(
      ((slateGames ?? []) as any[])
        .flatMap((g) => [g.home_team, g.away_team])
        .map((t) => String(t ?? "").toUpperCase())
        .filter((t) => /^[A-Z0-9]{2,4}$/.test(t))
    ),
  ];
  if (teams.length === 0) return [];
  // Team abbreviations collide across sports (TB, CLE, KC...) — scope the
  // recent-finals lookup to the pool's own sport(s) or NFL players show up
  // in an MLB pool and vice versa.
  const sports = [
    ...new Set(
      ((slateGames ?? []) as any[])
        .map((g) => String(g.sport ?? "").toUpperCase())
        .filter(Boolean)
    ),
  ];

  const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const teamFilter = teams
    .map((t) => `home_team.eq.${t},away_team.eq.${t}`)
    .join(",");
  let recentQuery = supabase
    .from("games")
    .select("id")
    .eq("status", "final")
    .gte("starts_at", cutoff)
    .or(teamFilter);
  if (sports.length > 0) recentQuery = recentQuery.in("sport", sports);
  const { data: recentGames } = await recentQuery;
  const recentIds = ((recentGames ?? []) as any[]).map((g) => g.id);
  if (recentIds.length === 0) return [];

  const { data: lines } = await supabase
    .from("game_stat_lines")
    .select("player_name, team")
    .in("game_id", recentIds);
  const seen = new Map<string, { player_name: string; team: string }>();
  for (const l of (lines ?? []) as any[]) {
    const key = `${l.player_name}||${l.team}`;
    if (!seen.has(key))
      seen.set(key, { player_name: l.player_name, team: l.team ?? "" });
  }
  return [...seen.values()].sort((a, b) =>
    a.player_name.localeCompare(b.player_name)
  );
}

export interface CopyableLinePool {
  pool_id: string;
  pool_name: string;
  lines: { player_name: string; team: string; stat_key: string; line: string }[];
}

// Other over/under pools this commish created that already have lines,
// newest first — offered as copy sources so a new pool's line editor
// doesn't start blank. Copying only prefills the editor; the commish still
// reviews and hits Save lines (which replaces all lines, as before).
export async function getCopyableLinePools(
  currentPoolId: string
): Promise<CopyableLinePool[]> {
  const { supabase, user } = await getUser();
  const { data: pools } = await supabase
    .from("pickem_pools")
    .select("id, name")
    .eq("created_by", user.id)
    .eq("variant", "over_under")
    .neq("id", currentPoolId)
    .order("created_at", { ascending: false })
    .limit(10);
  const list = (pools ?? []) as any[];
  if (list.length === 0) return [];

  const { data: lines } = await supabase
    .from("pickem_lines")
    .select("pool_id, player_name, team, stat_key, line")
    .in(
      "pool_id",
      list.map((p) => p.id)
    )
    .order("created_at", { ascending: true });

  const byPool = new Map<string, CopyableLinePool["lines"]>();
  for (const l of (lines ?? []) as any[]) {
    if (!byPool.has(l.pool_id)) byPool.set(l.pool_id, []);
    byPool.get(l.pool_id)!.push({
      player_name: l.player_name,
      team: l.team ?? "",
      stat_key: l.stat_key,
      line: String(l.line),
    });
  }
  return list
    .filter((p) => (byPool.get(p.id) ?? []).length > 0)
    .map((p) => ({
      pool_id: p.id,
      pool_name: p.name,
      lines: byPool.get(p.id)!,
    }));
}

// Pick over or under on one prop. Upsert — re-tapping flips your side.
// Rejected after the pool locks.
export async function savePropPick(poolId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  const { pool } = await loadPickemPool(poolId);
  await memberRole(supabase, pool.group_id, user.id);
  if (pool.variant !== "over_under") throw new Error("This pool isn't over/under.");
  if (new Date(pool.lock_at).getTime() <= Date.now()) {
    throw new Error("Picks are locked.");
  }

  const lineId = String(formData.get("line_id") ?? "");
  const side = String(formData.get("side") ?? "");
  if (!lineId || (side !== "over" && side !== "under")) throw new Error("Pick over or under.");

  const { data: line } = await supabase
    .from("pickem_lines")
    .select("id")
    .eq("pool_id", poolId)
    .eq("id", lineId)
    .maybeSingle();
  if (!line) throw new Error("That prop isn't in this pool.");

  const { error } = await supabase.from("pickem_prop_picks").upsert(
    {
      pool_id: poolId,
      line_id: lineId,
      user_id: user.id,
      side,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pool_id,user_id,line_id" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${pool.group_id}/pickem/${poolId}`);
}
