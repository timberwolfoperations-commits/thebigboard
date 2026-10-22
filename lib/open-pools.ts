// Open (public) pools: discovery data shared by the Home feed and the
// Pools tab. A public pool is readable by any signed-in user; joining is
// a pool_guests row (lib/open-pool-actions). Guests play the one pool —
// picks, entries, its leaderboard — and never join the host group.

const ET = "America/New_York";

export type PoolType = "pickem" | "survivor";

// Pick'em lock label, ET, matching the dashboard/Pools-tab convention:
// "Locks 12:00 PM ET" today, "Locks Sat 12:00 PM ET" this week,
// "Locks Oct 24 ET" beyond that.
export function openLockLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET });
  const dayKey = (x: Date) =>
    x.toLocaleDateString("en-US", { timeZone: ET, year: "numeric", month: "numeric", day: "numeric" });
  if (dayKey(d) === dayKey(new Date())) return `Locks ${time} ET`;
  const diffDays = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diffDays >= 0 && diffDays < 7) {
    return `Locks ${d.toLocaleDateString("en-US", { weekday: "short", timeZone: ET })} ${time} ET`;
  }
  return `Locks ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET })} ET`;
}

// Survivor start label: "Starts Week 9 · Thu Oct 29" (first kickoff, ET).
// Games not loaded yet -> just the week.
export function survivorStartLabel(startWeek: number, firstKickoff: string | null): string {
  if (!firstKickoff) return `Starts Week ${startWeek}`;
  const d = new Date(firstKickoff).toLocaleDateString("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `Starts Week ${startWeek} · ${d}`;
}

// The viewer's guest rows, split by pool type.
export async function loadMyGuestPoolIds(
  supabase: any,
  userId: string
): Promise<{ pickem: Set<string>; survivor: Set<string> }> {
  const { data } = await supabase
    .from("pool_guests")
    .select("pool_type, pool_id")
    .eq("user_id", userId);
  const pickem = new Set<string>();
  const survivor = new Set<string>();
  for (const g of (data ?? []) as any[]) {
    if (g.pool_type === "pickem") pickem.add(g.pool_id);
    else if (g.pool_type === "survivor") survivor.add(g.pool_id);
  }
  return { pickem, survivor };
}

// Host group names for pools whose group the viewer isn't a member of.
// Reads the open_pool_hosts view (migration 022) — the groups row itself
// stays members-only because it carries the invite token.
export async function loadHostNames(
  supabase: any,
  poolIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (poolIds.length === 0) return names;
  const { data } = await supabase
    .from("open_pool_hosts")
    .select("pool_id, group_name")
    .in("pool_id", poolIds);
  for (const r of (data ?? []) as any[]) names.set(r.pool_id, r.group_name);
  return names;
}

// First kickoff of a survivor pool's start week (null if the week's games
// aren't loaded yet). Light version of computeSurvivorState's firstKickoff.
export async function survivorFirstKickoff(
  supabase: any,
  season: number,
  startWeek: number
): Promise<string | null> {
  const { data } = await supabase
    .from("games")
    .select("starts_at")
    .eq("sport", "NFL")
    .eq("season", season)
    .eq("week", startWeek)
    .order("starts_at", { ascending: true })
    .limit(1);
  return ((data ?? []) as any[])[0]?.starts_at ?? null;
}

export interface OpenPoolCardData {
  type: PoolType;
  id: string;
  groupId: string;
  name: string;
  hostGroup: string;
  format: "pickem" | "over_under" | "survivor";
  info: string; // lock / start line, ET
  href: string;
}

// Public pools this user can still discover: not a member of the host
// group, no guest row, no survivor entry, and still joinable (pick'em
// not yet locked, survivor not yet kicked off).
export async function loadOpenPoolDiscovery(
  supabase: any,
  userId: string,
  memberGroupIds: string[]
): Promise<OpenPoolCardData[]> {
  const now = Date.now();
  const memberGroups = new Set(memberGroupIds);
  const guests = await loadMyGuestPoolIds(supabase, userId);

  const { data: pickemPools } = await supabase
    .from("pickem_pools")
    .select("id, name, variant, group_id, lock_at, winner_user_id, scratched")
    .eq("is_public", true)
    .order("lock_at", { ascending: true });
  const { data: survivorPools } = await supabase
    .from("survivor_pools")
    .select("id, name, group_id, season, start_week")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const pickemCandidates = ((pickemPools ?? []) as any[]).filter(
    (p) =>
      !memberGroups.has(p.group_id) &&
      !guests.pickem.has(p.id) &&
      !p.winner_user_id &&
      !p.scratched &&
      new Date(p.lock_at).getTime() > now
  );
  const survivorCandidates = ((survivorPools ?? []) as any[]).filter(
    (p) => !memberGroups.has(p.group_id) && !guests.survivor.has(p.id)
  );

  // "No entry" is part of not-joined for survivor.
  let enteredSurvivor = new Set<string>();
  if (survivorCandidates.length > 0) {
    const { data: entries } = await supabase
      .from("survivor_entries")
      .select("pool_id")
      .eq("user_id", userId)
      .in("pool_id", survivorCandidates.map((p) => p.id));
    enteredSurvivor = new Set(((entries ?? []) as any[]).map((e) => e.pool_id));
  }

  const hostNames = await loadHostNames(supabase, [
    ...pickemCandidates.map((p) => p.id),
    ...survivorCandidates.map((p) => p.id),
  ]);

  const cards: OpenPoolCardData[] = [];
  for (const p of pickemCandidates) {
    cards.push({
      type: "pickem",
      id: p.id,
      groupId: p.group_id,
      name: p.name,
      hostGroup: hostNames.get(p.id) ?? "",
      format: p.variant === "over_under" ? "over_under" : "pickem",
      info: openLockLabel(p.lock_at),
      href: `/groups/${p.group_id}/pickem/${p.id}`,
    });
  }
  for (const p of survivorCandidates) {
    if (enteredSurvivor.has(p.id)) continue;
    const firstKickoff = await survivorFirstKickoff(supabase, p.season, p.start_week);
    if (firstKickoff && new Date(firstKickoff).getTime() <= now) continue; // entries closed
    cards.push({
      type: "survivor",
      id: p.id,
      groupId: p.group_id,
      name: p.name,
      hostGroup: hostNames.get(p.id) ?? "",
      format: "survivor",
      info: survivorStartLabel(p.start_week, firstKickoff),
      href: `/groups/${p.group_id}/survivor/${p.id}`,
    });
  }
  return cards;
}
