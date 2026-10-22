"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PoolType } from "./open-pools";

// Join an open (public) pool as a guest: a pool_guests row, NOT group
// membership. The guest lands on the pool page and plays that pool only.
// Members of the host group don't need a guest row — they just go in.
export async function joinOpenPool(poolType: PoolType, poolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const table = poolType === "pickem" ? "pickem_pools" : "survivor_pools";
  const { data: pool } = await supabase
    .from(table)
    .select("id, group_id, is_public")
    .eq("id", poolId)
    .maybeSingle();
  if (!pool || !(pool as any).is_public) throw new Error("That pool isn't open.");
  const groupId = (pool as any).group_id as string;

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    const { error } = await supabase.from("pool_guests").upsert(
      { pool_type: poolType, pool_id: poolId, user_id: user.id },
      { onConflict: "pool_type,pool_id,user_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/pools");
  redirect(`/groups/${groupId}/${poolType === "pickem" ? "pickem" : "survivor"}/${poolId}`);
}
