"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCanAdministerForGroup } from "@/lib/commissioner";
import {
  loadSeason,
  loadRoundGameStates,
  SEASON_WINNER_POINTS,
} from "@/lib/season";

// ---------------------------------------------------------- season admin
// Seasons themselves are created by seed/admin SQL for now; the one
// write the app needs is attaching an existing weekly pick'em pool as
// a season round (Rounds 5/6 of a live season, without touching SQL).
// Gate: group-aware lockdown first (a group admin passes inside their
// own group), then the caller must be the season's creator or a group
// admin — the same pair the migration-029 RLS write policies enforce.

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

export async function attachPoolToSeason(formData: FormData) {
  const { supabase, user } = await getUser();

  const seasonId = String(formData.get("seasonId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  const roundNo = Number(formData.get("roundNo"));
  if (!seasonId || !poolId || !Number.isInteger(roundNo) || roundNo < 1) {
    throw new Error("Pick a pool and a round.");
  }

  const { data: season } = await supabase
    .from("pickem_seasons")
    .select("id, group_id, rounds_total, created_by")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) throw new Error("Season not found.");
  if (roundNo > season.rounds_total) {
    throw new Error(`Round ${roundNo} is past this season's ${season.rounds_total} rounds.`);
  }

  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", season.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  assertCanAdministerForGroup(user, membership?.role ?? null);

  if (season.created_by !== user.id) {
    if (!membership) throw new Error("You're not in this group.");
    if (membership.role !== "admin") {
      throw new Error("Only the season's creator or a group admin can attach rounds.");
    }
  }

  const { data: pool } = await supabase
    .from("pickem_pools")
    .select("id, group_id, variant")
    .eq("id", poolId)
    .maybeSingle();
  if (!pool) throw new Error("Pool not found.");
  if (pool.group_id !== season.group_id) {
    throw new Error("That pool belongs to a different group.");
  }
  if (pool.variant !== "standard" && pool.variant !== "confidence") {
    throw new Error("Season rounds are standard or Top 5 Confidence pick'em pools.");
  }

  // A season is one format: every linked round must share the new
  // pool's variant, or the season board wouldn't know whether to rank
  // by correct picks or confidence points (see seasonIsConfidence).
  const { data: linked } = await supabase
    .from("pickem_season_rounds")
    .select("pool_id, pickem_pools(variant)")
    .eq("season_id", seasonId);
  const linkedVariants = new Set(
    ((linked ?? []) as any[])
      .map((r) => r.pickem_pools?.variant)
      .filter((v): v is string => typeof v === "string")
  );
  if (
    linkedVariants.size > 0 &&
    (linkedVariants.size !== 1 || !linkedVariants.has(pool.variant))
  ) {
    throw new Error("This season already has a different format — all rounds must be the same game type.");
  }

  const { data: existing } = await supabase
    .from("pickem_season_rounds")
    .select("season_id, round_no")
    .or(`pool_id.eq.${poolId},and(season_id.eq.${seasonId},round_no.eq.${roundNo})`);
  if ((existing ?? []).length > 0) {
    throw new Error("That pool is already in a season, or that round is already taken.");
  }

  const { error } = await supabase
    .from("pickem_season_rounds")
    .insert({ season_id: seasonId, pool_id: poolId, round_no: roundNo });
  if (error) throw new Error("Couldn't attach that round — it may already be linked.");

  revalidatePath(`/groups/${season.group_id}/pickem/season/${seasonId}`);
  revalidatePath(`/groups/${season.group_id}`);
}

// ---------------------------------------------------------- season award
// Bank the season champion(s) on the group lifetime board: one
// pickem_season_winners row each at SEASON_WINNER_POINTS (migration
// 034), which lib/lifetime.ts reads as a sixth lifetime source.
// Gate: group-aware lockdown first, then the caller must be the
// season's creator or a group admin — the same pair the migration-034
// RLS write policy enforces. The season must be complete (every round
// linked and every round's games final) and every champion must be a
// group member. Upsert on the (season_id, user_id) PK, so re-awarding
// the same champion is a no-op and co-champions are just two rows;
// there is deliberately no un-award in v1 (a wrong award is fixed
// with SQL).

export async function awardSeasonWinners(formData: FormData) {
  const { supabase, user } = await getUser();

  const seasonId = String(formData.get("seasonId") ?? "");
  const winnerIds = [...new Set(formData.getAll("winnerIds").map(String).filter(Boolean))];
  if (!seasonId || winnerIds.length === 0) {
    throw new Error("Pick at least one champion.");
  }

  const { data: season } = await supabase
    .from("pickem_seasons")
    .select("id, group_id, rounds_total, created_by")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) throw new Error("Season not found.");

  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", season.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  assertCanAdministerForGroup(user, membership?.role ?? null);

  if (season.created_by !== user.id) {
    if (!membership) throw new Error("You're not in this group.");
    if (membership.role !== "admin") {
      throw new Error("Only the season's creator or a group admin can award the season.");
    }
  }

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", season.group_id)
    .in("user_id", winnerIds);
  const memberIds = new Set(((members ?? []) as any[]).map((m) => m.user_id));
  if (winnerIds.some((id) => !memberIds.has(id))) {
    throw new Error("Every champion has to be a member of the group.");
  }

  // The season has to be over: every round linked and every round's
  // games final (derived from the games table, never from a winners
  // row — the same rule the season page's round statuses use).
  const loaded = await loadSeason(supabase, seasonId);
  if (!loaded || loaded.rounds.length !== season.rounds_total) {
    throw new Error("The season isn't complete yet — every round has to be linked first.");
  }
  const states = await loadRoundGameStates(supabase, loaded.rounds);
  const allFinal = loaded.rounds.every((r) => states.get(r.pool_id)?.allFinal);
  if (!allFinal) {
    throw new Error("The season isn't over yet — every round's games have to be final first.");
  }

  const { error } = await supabase.from("pickem_season_winners").upsert(
    winnerIds.map((user_id) => ({
      season_id: seasonId,
      user_id,
      points: SEASON_WINNER_POINTS,
    })),
    { onConflict: "season_id,user_id", ignoreDuplicates: true }
  );
  if (error) {
    throw new Error(
      "Couldn't award the season — make sure migration 034 has run in Supabase, then try again."
    );
  }

  revalidatePath(`/groups/${season.group_id}/pickem/season/${seasonId}`);
  revalidatePath(`/groups/${season.group_id}`);
}
