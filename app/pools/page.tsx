import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loadMyGroups, loadMyPools, resolveLandingPool } from "@/lib/my-pools";
import { loadOpenPoolDiscovery } from "@/lib/open-pools";
import OpenPoolCard from "@/components/open-pool-card";
import PoolsNewMenu from "@/components/pools-new-menu";
import { isSiteCommissioner } from "@/lib/commissioner";

// Pools tab, detail-first (2026-10-30): this route no longer renders a
// list. It resolves the one pool you should be looking at — the one
// that needs your pick, else the last one you were in — and sends you
// straight to its page, where the switcher holds the rest. The list
// only exists as a destination for a user with no pools at all, and
// for them this page is the loud once-in-a-lifetime state: join, find
// an open pool, or start one.

export default async function PoolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Fast path (perceived-speed pass): the last-pool cookie stores a
  // full pool href (/groups/<gid>/<kind>/<pid>). If it's there, go
  // straight back without running the loadMy* chain — every pool
  // detail page enforces access itself (signed-in check + the pool
  // row only loads under RLS for members/guests, else it bounces to
  // the group page, which blocks non-members), so the shortcut
  // grants nothing. The full chain below only runs on a first visit
  // (no cookie), where needs-you ranking lives.
  const fastJar = await cookies();
  const rawLast = fastJar.get("bb-last-pool")?.value;
  if (rawLast) {
    let href: string | null = null;
    try {
      href = decodeURIComponent(rawLast);
    } catch {
      href = null;
    }
    if (href && href.startsWith("/groups/") && !href.startsWith("//")) {
      redirect(href);
    }
  }

  const pools = await loadMyPools(supabase, user.id);
  if (pools.length > 0) {
    const jar = await cookies();
    let lastPool: string | null = null;
    const raw = jar.get("bb-last-pool")?.value;
    if (raw) {
      try {
        lastPool = decodeURIComponent(raw);
      } catch {
        lastPool = null;
      }
    }
    const landing = resolveLandingPool(pools, lastPool);
    if (landing) redirect(landing.href);
  }

  // No pools yet — the one place create/join gets to be loud.
  const groups = await loadMyGroups(supabase, user.id);
  const groupIds = groups.map((g) => g.id);
  const openPoolCards = await loadOpenPoolDiscovery(supabase, user.id, groupIds);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">Pools</h1>
        <p className="mt-2 text-sm text-slate-500">
          You&apos;re not in any pools yet. Join one below, or start one — after that, this tab
          opens straight onto your pool.
        </p>
      </div>

      {openPoolCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Open pools — jump in
          </h2>
          {openPoolCards.map((pool) => (
            <OpenPoolCard key={`${pool.type}-${pool.id}`} pool={pool} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Start your own
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            Pools live in groups — create a group from the Groups tab first, then start a pool
            for it. Or open an invite link and you&apos;re in.
          </p>
        ) : (
          (() => {
            // Group-aware: the site commissioner can create anywhere; a
            // group admin only in the groups they administer. Only those
            // groups reach the picker — the per-group menus gate again.
            const creatableGroups = isSiteCommissioner(user)
              ? groups
              : groups.filter((g) => g.role === "admin");
            if (creatableGroups.length === 0) {
              return (
                <p className="text-sm text-slate-500">
                  Creating is locked while The Big Board is in testing — Michael&rsquo;s running
                  all the pools for now. Join one above, or open an invite link and you&rsquo;re in.
                </p>
              );
            }
            return <PoolsNewMenu groups={creatableGroups} />;
          })()
        )}
      </section>
    </div>
  );
}
