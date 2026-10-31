import { computeSurvivorState } from "@/lib/survivor";
import { loadHostNames, loadMyGuestPoolIds } from "@/lib/open-pools";

// The detail-first tabs (Oct 30 direction): the Pools tab lands on ONE
// pool — the one that needs you — and pool pages carry a switcher with
// the rest. This module is the one place that assembles "my pools"
// (pick'em + survivor, member + guest) and ranks them for that landing.
//
// Scope matches the old Pools tab: pick'em + survivor only. Roster
// pools and quizzes are not Pools-tab citizens (quizzes live on the
// feed; roster pools are group-page only, per Michael's standing call).

export interface MyGroup {
  id: string;
  name: string;
}

export interface MyPool {
  key: string; // "pickem:<id>" | "survivor:<id>"
  kind: "pickem" | "survivor";
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  href: string;
  guest: boolean;
  settled: boolean;
  needsAction: boolean;
  statusText: string; // switcher sub-line, e.g. "Test of Manhood · picks open"
  sortTs: number;
}

export async function loadMyGroups(supabase: any, userId: string): Promise<MyGroup[]> {
  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  return ((memberships ?? []) as any[])
    .map((m) => m.groups)
    .filter((g: any) => g?.id)
    .map((g: any) => ({ id: g.id as string, name: g.name as string }));
}

export async function loadMyPools(supabase: any, userId: string): Promise<MyPool[]> {
  const groups = await loadMyGroups(supabase, userId);
  const groupIds = groups.map((g) => g.id);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const myGuests = await loadMyGuestPoolIds(supabase, userId);
  const now = Date.now();
  const pools: MyPool[] = [];

  // ---- pick'em -------------------------------------------------------------
  const { data: pickemPools } = groupIds.length
    ? await supabase
        .from("pickem_pools")
        .select("id, name, variant, group_id, lock_at, winner_user_id, scratched, created_at")
        .in("group_id", groupIds)
        .order("lock_at", { ascending: false })
    : { data: [] as any[] };
  const pickemList = [...((pickemPools ?? []) as any[])];
  const guestPickemIds = [...myGuests.pickem].filter((pid) => !pickemList.some((p) => p.id === pid));
  if (guestPickemIds.length) {
    const { data: guestPickemPools } = await supabase
      .from("pickem_pools")
      .select("id, name, variant, group_id, lock_at, winner_user_id, scratched, created_at")
      .in("id", guestPickemIds);
    pickemList.push(...((guestPickemPools ?? []) as any[]));
  }
  const pickemIds = pickemList.map((p) => p.id);

  // Standard pools: which games are still unstarted, and which has the
  // viewer already picked? A pool "needs action" when an unstarted game
  // is still unpicked (per-game locks — the pool's own lock_at is not
  // the gate anymore).
  const { data: links } = pickemIds.length
    ? await supabase
        .from("pickem_pool_games")
        .select("pool_id, game_id, games(starts_at)")
        .in("pool_id", pickemIds)
    : { data: [] as any[] };
  const openGames = new Map<string, Set<string>>();
  for (const l of (links ?? []) as any[]) {
    const startsAt = l.games?.starts_at ? new Date(l.games.starts_at).getTime() : 0;
    if (startsAt > now) {
      const set = openGames.get(l.pool_id) ?? new Set<string>();
      set.add(l.game_id);
      openGames.set(l.pool_id, set);
    }
  }
  const { data: myPicks } = pickemIds.length
    ? await supabase.from("pickem_picks").select("pool_id, game_id").eq("user_id", userId).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const myPickedGames = new Map<string, Set<string>>();
  for (const p of (myPicks ?? []) as any[]) {
    const set = myPickedGames.get(p.pool_id) ?? new Set<string>();
    set.add(p.game_id);
    myPickedGames.set(p.pool_id, set);
  }
  // Over/under pools pick props, not games: open = lines unpicked while
  // the pool hasn't locked.
  const { data: myPropPicks } = pickemIds.length
    ? await supabase.from("pickem_prop_picks").select("pool_id").eq("user_id", userId).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const myPropCount = new Map<string, number>();
  for (const p of (myPropPicks ?? []) as any[]) {
    myPropCount.set(p.pool_id, (myPropCount.get(p.pool_id) ?? 0) + 1);
  }
  const { data: propLines } = pickemIds.length
    ? await supabase.from("pickem_lines").select("pool_id").in("pool_id", pickemIds)
    : { data: [] as any[] };
  const lineCount = new Map<string, number>();
  for (const l of (propLines ?? []) as any[]) {
    lineCount.set(l.pool_id, (lineCount.get(l.pool_id) ?? 0) + 1);
  }

  for (const p of pickemList) {
    const settled = p.winner_user_id != null || !!p.scratched;
    let needsAction = false;
    if (!settled) {
      if (p.variant === "over_under") {
        needsAction =
          new Date(p.lock_at).getTime() > now && (myPropCount.get(p.id) ?? 0) < (lineCount.get(p.id) ?? 0);
      } else {
        const open = openGames.get(p.id) ?? new Set<string>();
        const picked = myPickedGames.get(p.id) ?? new Set<string>();
        needsAction = [...open].some((gid) => !picked.has(gid));
      }
    }
    pools.push({
      key: `pickem:${p.id}`,
      kind: "pickem",
      id: p.id,
      groupId: p.group_id,
      groupName: groupName.get(p.group_id) ?? "Pool",
      name: p.name,
      href: `/groups/${p.group_id}/pickem/${p.id}`,
      guest: guestPickemIds.includes(p.id),
      settled,
      needsAction,
      statusText: "",
      sortTs: new Date(p.lock_at ?? p.created_at).getTime(),
    });
  }

  // ---- survivor --------------------------------------------------------------
  const { data: survivorPools } = groupIds.length
    ? await supabase
        .from("survivor_pools")
        .select("id, name, group_id, season, start_week, created_by, created_at")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };
  const survivorList = [...((survivorPools ?? []) as any[])];
  const guestSurvivorIds = [...myGuests.survivor].filter(
    (pid) => !survivorList.some((p) => p.id === pid)
  );
  if (guestSurvivorIds.length) {
    const { data: guestSurvivorPools } = await supabase
      .from("survivor_pools")
      .select("id, name, group_id, season, start_week, created_by, created_at")
      .in("id", guestSurvivorIds);
    survivorList.push(...((guestSurvivorPools ?? []) as any[]));
  }
  // Guest pools' host group names come from the open_pool_hosts view —
  // the groups row itself is members-only.
  const joinedGuestIds = [...guestPickemIds, ...guestSurvivorIds];
  if (joinedGuestIds.length) {
    const hostNames = await loadHostNames(supabase, joinedGuestIds);
    for (const p of pools) {
      const host = hostNames.get(p.id);
      if (host && p.guest) p.groupName = host;
    }
    for (const p of survivorList) {
      const host = hostNames.get(p.id);
      if (host && !groupName.has(p.group_id)) groupName.set(p.group_id, host);
    }
  }

  for (const p of survivorList) {
    const state = await computeSurvivorState(supabase, p);
    const entry = state.entries.find((e) => e.user_id === userId);
    const settled = state.decided;
    let needsAction = false;
    if (!settled && entry?.alive && state.currentWeek != null && !entry.picks.has(state.currentWeek)) {
      const weekGames = state.gamesByWeek.get(state.currentWeek) ?? [];
      needsAction = weekGames.some((g) => g.starts_at && new Date(g.starts_at).getTime() > now);
    }
    pools.push({
      key: `survivor:${p.id}`,
      kind: "survivor",
      id: p.id,
      groupId: p.group_id,
      groupName: groupName.get(p.group_id) ?? "Pool",
      name: p.name,
      href: `/groups/${p.group_id}/survivor/${p.id}`,
      guest: guestSurvivorIds.includes(p.id),
      settled,
      needsAction,
      statusText: "",
      sortTs: state.firstKickoff
        ? new Date(state.firstKickoff).getTime()
        : new Date(p.created_at).getTime(),
    });
  }

  for (const p of pools) {
    p.statusText = `${p.groupName} · ${p.needsAction ? "needs your pick" : p.settled ? "settled" : "open"}`;
  }
  return pools;
}

// Landing order: needs-action first (earliest deadline first), then
// open pools by recency, then settled by recency.
export function rankPools(pools: MyPool[]): MyPool[] {
  const rank = (p: MyPool) => (p.needsAction ? 0 : p.settled ? 2 : 1);
  return [...pools].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return rank(a) === 0 ? a.sortTs - b.sortTs : b.sortTs - a.sortTs;
  });
}

// The pool the Pools tab lands on: the top-ranked pool, except the
// last-viewed pool wins when nothing needs action (you were just there).
export function resolveLandingPool(pools: MyPool[], lastPoolHref: string | null): MyPool | null {
  const ranked = rankPools(pools);
  if (ranked.length === 0) return null;
  if (ranked[0].needsAction) return ranked[0];
  if (lastPoolHref) {
    const last = pools.find((p) => p.href === lastPoolHref);
    if (last) return last;
  }
  return ranked[0];
}
