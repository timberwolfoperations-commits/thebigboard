import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computePickemLeaderboard } from "@/lib/pickem-scoring";
import { computePoolPoints } from "@/lib/pool-scoring";
import { Card, SectionTitle } from "@/components/ui";
import DashboardGroupMenu from "@/components/dashboard-group-menu";
import HappeningPoolCard from "@/components/happening-pool-card";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Honest freshness label for the live scores view — the sync runs every
// 15 minutes, so the UI says "updated N min ago" instead of implying
// real-time scores.
function syncedAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "updated just now";
  if (mins === 1) return "updated 1 min ago";
  return `updated ${mins} min ago`;
}

function kickoffLabel(iso: string | null): string {
  if (!iso) return "";
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: ET,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

interface LiveGame {
  id: string;
  label: string;
  home_team: string | null;
  away_team: string | null;
  starts_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  period: number | null;
  clock: string | null;
  sport: string | null;
}

interface LivePoolData {
  games: LiveGame[];
  pickByGame: Map<string, string>;
  syncedAgo: string | null;
  finalCount: number;
}

const ET = "America/New_York";

// Compact lock label, always in ET to match the pool page's convention:
// "Locks 8:00 PM ET" today, "Locks Sat 8:00 PM ET" this week,
// "Locks Oct 24 ET" beyond that. (Server renders in UTC — never format
// a time without timeZone: ET.)
function lockLabel(iso: string) {
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

function variantPill(kind: string, variant?: string) {
  if (variant === "over_under") {
    return (
      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        over/under
      </span>
    );
  }
  if (kind === "pickem") {
    return (
      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        pick&rsquo;em
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      roster
    </span>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const userId = user.id;

  const { group: groupFilter } = await searchParams;

  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, groups(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const groups = ((memberships ?? []) as any[])
    .map((m) => ({ ...(m.groups as any), role: m.role }))
    .filter((g) => g.id);
  const groupIds = groups.map((g) => g.id);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const visibleGroupIds =
    groupFilter && groupIds.includes(groupFilter) ? [groupFilter] : groupIds;

  // ---- pools across visible groups -----------------------------------------
  const { data: rosterPools } = groupIds.length
    ? await supabase
        .from("pools")
        .select("id, name, group_id, lock_at, winner_user_id, winner_points")
        .in("group_id", visibleGroupIds)
        .order("lock_at", { ascending: false })
    : { data: [] as any[] };
  const { data: pickemPools } = groupIds.length
    ? await supabase
        .from("pickem_pools")
        .select("id, name, variant, group_id, lock_at, winner_user_id, winner_points, scratched")
        .in("group_id", visibleGroupIds)
        .order("lock_at", { ascending: false })
    : { data: [] as any[] };

  const rosterList = (rosterPools ?? []) as any[];
  const pickemList = (pickemPools ?? []) as any[];
  const rosterIds = rosterList.map((p) => p.id);
  const pickemIds = pickemList.map((p) => p.id);
  const now = Date.now();

  const settledRoster = rosterList.filter((p) => p.winner_user_id);
  const liveRoster = rosterList.filter((p) => !p.winner_user_id);
  const settledPickem = pickemList.filter((p) => p.winner_user_id || p.scratched);
  const livePickem = pickemList.filter((p) => !p.winner_user_id && !p.scratched);

  // ---- my entries / picks ----------------------------------------------------
  const { data: myEntries } = rosterIds.length
    ? await supabase.from("pool_entries").select("pool_id").eq("user_id", user.id).in("pool_id", rosterIds)
    : { data: [] as any[] };
  const enteredRoster = new Set(((myEntries ?? []) as any[]).map((e) => e.pool_id));

  const { data: myPicks } = pickemIds.length
    ? await supabase.from("pickem_picks").select("pool_id").eq("user_id", user.id).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const pickedStandard = new Set(((myPicks ?? []) as any[]).map((p) => p.pool_id));

  const { data: myPropPicks } = pickemIds.length
    ? await supabase.from("pickem_prop_picks").select("pool_id, line_id").eq("user_id", user.id).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const propPickCount = new Map<string, number>();
  for (const p of (myPropPicks ?? []) as any[]) {
    propPickCount.set(p.pool_id, (propPickCount.get(p.pool_id) ?? 0) + 1);
  }

  const openOverUnderIds = livePickem
    .filter((p) => p.variant === "over_under" && new Date(p.lock_at).getTime() > now)
    .map((p) => p.id);
  const { data: propLines } = openOverUnderIds.length
    ? await supabase.from("pickem_lines").select("id, pool_id").in("pool_id", openOverUnderIds)
    : { data: [] as any[] };
  const lineCount = new Map<string, number>();
  for (const l of (propLines ?? []) as any[]) {
    lineCount.set(l.pool_id, (lineCount.get(l.pool_id) ?? 0) + 1);
  }

  // ---- pending bets waiting on me --------------------------------------------
  const { data: bets } = groupIds.length
    ? await supabase
        .from("bets")
        .select("id, title, group_id, status, points")
        .in("group_id", visibleGroupIds)
        .eq("status", "pending")
    : { data: [] as any[] };
  const pendingBets = (bets ?? []) as any[];
  const { data: betParts } = pendingBets.length
    ? await supabase
        .from("bet_participants")
        .select("bet_id, accepted")
        .eq("user_id", user.id)
        .in("bet_id", pendingBets.map((b) => b.id))
    : { data: [] as any[] };
  const waitingBetIds = new Set(
    ((betParts ?? []) as any[]).filter((p) => !p.accepted).map((p) => p.bet_id)
  );
  const myPendingBets = pendingBets.filter((b) => waitingBetIds.has(b.id));

  // ---- action items ------------------------------------------------------------
  type Action = { href: string; title: string; group: string; cta: string; detail: string };
  const actions: Action[] = [];
  for (const p of liveRoster) {
    if (new Date(p.lock_at).getTime() > now && !enteredRoster.has(p.id)) {
      actions.push({
        href: `/groups/${p.group_id}/pools/${p.id}`,
        title: p.name,
        group: groupName.get(p.group_id) ?? "",
        cta: "Enter pool",
        detail: lockLabel(p.lock_at),
      });
    }
  }
  for (const p of livePickem) {
    if (new Date(p.lock_at).getTime() <= now) continue;
    const picked =
      p.variant === "over_under"
        ? (propPickCount.get(p.id) ?? 0)
        : pickedStandard.has(p.id)
          ? 1
          : 0;
    const total = p.variant === "over_under" ? (lineCount.get(p.id) ?? 0) : 1;
    if (picked < total) {
      actions.push({
        href: `/groups/${p.group_id}/pickem/${p.id}`,
        title: p.name,
        group: groupName.get(p.group_id) ?? "",
        cta: picked > 0 ? "Finish picks" : "Make your picks",
        detail: `${picked}/${total} picked · ${lockLabel(p.lock_at)}`,
      });
    }
  }
  for (const b of myPendingBets) {
    actions.push({
      href: `/groups/${b.group_id}/bets/${b.id}`,
      title: b.title,
      group: groupName.get(b.group_id) ?? "",
      cta: "Respond",
      detail: `${b.points} pts on the line`,
    });
  }

  // ---- standings for live (locked) pools ---------------------------------------
  async function rosterStanding(poolId: string) {
    const { data: entries } = await supabase
      .from("pool_entries")
      .select("id, user_id")
      .eq("pool_id", poolId);
    const entryList = (entries ?? []) as any[];
    if (entryList.length === 0) return null;
    const { data: picks } = await supabase
      .from("pool_entry_picks")
      .select("entry_id, player_id")
      .in("entry_id", entryList.map((e: any) => e.id));
    const { points } = await computePoolPoints(supabase, poolId);
    const picksByEntry = new Map<string, number>();
    for (const pk of (picks ?? []) as any[]) {
      picksByEntry.set(pk.entry_id, (picksByEntry.get(pk.entry_id) ?? 0) + (points.get(pk.player_id) ?? 0));
    }
    const board = entryList
      .map((e: any) => ({ user_id: e.user_id, total: picksByEntry.get(e.id) ?? 0 }))
      .sort((a: any, b: any) => b.total - a.total);
    const idx = board.findIndex((r: any) => r.user_id === userId);
    return {
      rank: idx >= 0 ? idx + 1 : null,
      points: idx >= 0 ? board[idx].total : null,
      count: board.length,
    };
  }

  async function pickemStanding(poolId: string) {
    const board = await computePickemLeaderboard(supabase, poolId);
    if (board.length === 0) return null;
    const idx = board.findIndex((r: any) => r.user_id === userId);
    return {
      rank: idx >= 0 ? idx + 1 : null,
      points: idx >= 0 ? (board[idx] as any).points : null,
      count: board.length,
    };
  }

  // Per-game rows for the live dashboard view: linked games plus the
  // viewer's picks, with the sync watermark for honest freshness.
  // Only used for locked standard pick'em pools.
  async function pickemLiveGames(poolId: string): Promise<LivePoolData | null> {
    const { data: links } = await supabase
      .from("pickem_pool_games")
      .select("game_id")
      .eq("pool_id", poolId);
    const gameIds = ((links ?? []) as any[]).map((l: any) => l.game_id);
    if (gameIds.length === 0) return null;
    const { data: games } = await supabase
      .from("games")
      .select(
        "id, label, home_team, away_team, starts_at, status, home_score, away_score, period, clock, sport"
      )
      .in("id", gameIds);
    const gameList = ((games ?? []) as any[]) as LiveGame[];
    if (gameList.length === 0) return null;
    const { data: picks } = await supabase
      .from("pickem_picks")
      .select("game_id, picked_team")
      .eq("pool_id", poolId)
      .eq("user_id", userId);
    const pickByGame = new Map(
      ((picks ?? []) as any[]).map((p: any) => [p.game_id, String(p.picked_team ?? "").toUpperCase()])
    );
    // Most common sport among the games — pools are single-sport in practice.
    const sportCounts = new Map<string, number>();
    for (const g of gameList) {
      const s = String(g.sport ?? "").toUpperCase();
      if (s) sportCounts.set(s, (sportCounts.get(s) ?? 0) + 1);
    }
    const sport = [...sportCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    let syncedAgo: string | null = null;
    if (sport) {
      const { data: syncRow } = await supabase
        .from("sync_state")
        .select("synced_at")
        .eq("sport", sport)
        .maybeSingle();
      syncedAgo = syncedAgoLabel((syncRow as any)?.synced_at ?? null);
    }
    const rank = (g: LiveGame) => (g.status === "in_progress" ? 0 : g.status === "scheduled" ? 1 : 2);
    const sorted = [...gameList].sort(
      (a, b) => rank(a) - rank(b) || new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime()
    );
    return {
      games: sorted,
      pickByGame,
      syncedAgo,
      finalCount: gameList.filter((g) => g.status === "final").length,
    };
  }

  const happening = [...liveRoster.map((p) => ({ ...p, kind: "roster" as const })), ...livePickem.map((p) => ({ ...p, kind: "pickem" as const }))]
    .sort((a, b) => new Date(b.lock_at).getTime() - new Date(a.lock_at).getTime());

  const standings = new Map<string, { rank: number | null; points: number | null; count: number } | null>();
  const liveData = new Map<string, LivePoolData | null>();
  await Promise.all(
    happening
      .filter((p) => new Date(p.lock_at).getTime() <= now)
      .map(async (p) => {
        const s = p.kind === "roster" ? await rosterStanding(p.id) : await pickemStanding(p.id);
        standings.set(p.id, s);
        if (p.kind === "pickem" && (p as any).variant === "standard") {
          liveData.set(p.id, await pickemLiveGames(p.id));
        }
      })
  );

  const settled = [
    ...settledRoster.map((p) => ({ ...p, kind: "roster" as const, variant: "roster" })),
    ...settledPickem.map((p) => ({ ...p, kind: "pickem" as const })),
  ].sort((a, b) => new Date(b.lock_at).getTime() - new Date(a.lock_at).getTime());

  return (
    <div className="space-y-8">
      <DashboardGroupMenu groups={groups} active={groupFilter ?? null} />

      {actions.length > 0 && (
        <div className="rounded-2xl bg-slate-900 p-4 text-white">
          <p className="font-display text-xl font-bold uppercase tracking-wide">
            Needs your action
          </p>
          <div className="mt-3 space-y-2">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-3 hover:bg-slate-700"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{a.title}</span>
                  <span className="block text-xs text-slate-400">
                    {a.group} · {a.detail}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-orange-700 px-4 py-1.5 text-sm font-semibold text-white">
                  {a.cta}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Happening now</SectionTitle>
        {happening.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No action on the board. Fix that.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {happening.map((p: any) => {
              const locked = new Date(p.lock_at).getTime() <= now;
              const st = standings.get(p.id);
              const live = locked ? liveData.get(p.id) : undefined;
              const href =
                p.kind === "roster"
                  ? `/groups/${p.group_id}/pools/${p.id}`
                  : `/groups/${p.group_id}/pickem/${p.id}`;
              return (
                <HappeningPoolCard
                  key={`${p.kind}-${p.id}`}
                  header={
                    <>
                      <Link
                        href={href}
                        className="truncate font-display text-lg font-semibold uppercase tracking-wide hover:text-[#c2410c]"
                      >
                        {p.name}
                      </Link>
                      {variantPill(p.kind, p.variant)}
                    </>
                  }
                  sub={
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-500">{groupName.get(p.group_id)}</span>
                      {" · "}
                      {locked ? (
                        st && st.rank != null ? (
                          <span className="font-semibold text-slate-900">
                            {ordinal(st.rank)} of {st.count} · {st.points} pts
                          </span>
                        ) : (
                          <span>Live{st ? ` · ${st.count} entries` : ""}</span>
                        )
                      ) : (
                        <span>{lockLabel(p.lock_at)}</span>
                      )}
                    </p>
                  }
                  live={
                    live
                      ? {
                          games: live.games,
                          picks: Object.fromEntries(live.pickByGame),
                          syncedAgo: live.syncedAgo,
                          finalCount: live.finalCount,
                        }
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {settled.length > 0 && (
        <div>
          <SectionTitle>Settled</SectionTitle>
          <div className="space-y-2">
            {settled.map((p: any) => {
              const href =
                p.kind === "roster"
                  ? `/groups/${p.group_id}/pools/${p.id}`
                  : `/groups/${p.group_id}/pickem/${p.id}`;
              return (
                <Link key={`${p.kind}-${p.id}`} href={href}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-slate-500">
                        {p.name}
                      </p>
                      {variantPill(p.kind, p.variant)}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      <span>{groupName.get(p.group_id)}</span>
                      {" · "}
                      {p.scratched ? (
                        <span>Scratched — no winner</span>
                      ) : (
                        <span>
                          Settled · +{p.winner_points} pts
                        </span>
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
