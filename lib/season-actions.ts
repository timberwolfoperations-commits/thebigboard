"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCanAdministerForGroup } from "@/lib/commissioner";

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
