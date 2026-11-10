import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loadMyGroups, loadMyPools } from "@/lib/my-pools";
import NewGroupMenu from "@/components/new-group-menu";

// Groups tab, detail-first (2026-10-30): same move as the Pools tab —
// land on a group, not a list of groups. The landing group is the one
// holding the pool that needs you, else the last group you were in,
// else your most recent group. The switcher on the group page holds
// the rest.

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Fast path (perceived-speed pass): if you were just in a group,
  // go straight back — the group page itself enforces membership
  // (its groups query runs under RLS "readable by members", and a
  // non-member gets the "You're not in this group" card), so skipping
  // the loadMy* chain here grants nothing. The full chain below only
  // runs on a first visit (no cookie), where needs-you priority and
  // the empty state live.
  const fastJar = await cookies();
  const lastGroup = fastJar.get("bb-last-group")?.value;
  if (lastGroup && /^[A-Za-z0-9-]+$/.test(lastGroup)) {
    redirect(`/groups/${lastGroup}`);
  }

  const groups = await loadMyGroups(supabase, user.id);
  if (groups.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
            Groups
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Groups are your people — the lifetime board, the rivalry history. Create one, or
            join with an invite link.
          </p>
        </div>
        <NewGroupMenu />
      </div>
    );
  }

  const memberIds = new Set(groups.map((g) => g.id));
  let target: string | null = null;

  // The group holding the pool that needs you wins.
  const pools = await loadMyPools(supabase, user.id);
  const needy = pools.find((p) => p.needsAction && memberIds.has(p.groupId));
  if (needy) target = needy.groupId;

  if (!target) {
    const jar = await cookies();
    const last = jar.get("bb-last-group")?.value;
    if (last && memberIds.has(last)) target = last;
  }

  redirect(`/groups/${target ?? groups[0].id}`);
}
