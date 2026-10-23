import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computePickemLeaderboard } from "@/lib/pickem-scoring";
import { computeSurvivorState } from "@/lib/survivor";
import { loadHostNames, loadMyGuestPoolIds, loadOpenPoolDiscovery } from "@/lib/open-pools";
import { Card } from "@/components/ui";
import BotTag from "@/components/bot-tag";
import ExpandableCard from "@/components/expandable-card";
import PoolsNewMenu from "@/components/pools-new-menu";
import OpenPoolCard from "@/components/open-pool-card";

// Pools tab: every pool the user is in, across all their groups — the
// cross-group score-checker. Cards expand in place to a glanceable
// "lobby" (top-3 standings + the viewer's status); the full pool page
// stays one tap away for making picks and admin work. Data patterns
// mirror the dashboard's (same tables, same scoring helpers).

const ET = "America/New_York";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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

function StandingRows({
  rows,
  userId,
}: {
  rows: { user_id: string; display_name: string; points: number; is_bot?: boolean }[];
  userId: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No picks in yet.</p>;
  }
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={r.user_id}
          className={`flex items-baseline py-1 text-sm ${
            r.user_id === userId ? "font-semibold text-orange-700" : ""
          }`}
        >
          <span className="w-6 shrink-0 text-xs text-slate-400">{i + 1}</span>
          <span className="min-w-0 truncate">
            {r.display_name}
            {r.is_bot && <BotTag />}
            {r.user_id === userId && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
          </span>
          <span className="ml-auto shrink-0 font-semibold tabular-nums">{r.points} pts</span>
        </div>
      ))}
    </div>
  );
}

export default async function PoolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const userId = user.id;
  const now = Date.now();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  const groups = ((memberships ?? []) as any[])
    .map((m) => m.groups)
    .filter((g: any) => g?.id)
    .map((g: any) => ({ id: g.id as string, name: g.name as string }));
  const groupIds = groups.map((g) => g.id);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // Open pools: unjoined ones are discovery cards at the bottom; pools
  // I've joined as a guest are unioned into the lists below so they get
  // the same expandable lobby cards (standings, pick status) as member
  // pools.
  const openPoolCards = await loadOpenPoolDiscovery(supabase, user.id, groupIds);
  const myGuests = await loadMyGuestPoolIds(supabase, user.id);

  // ---- pick'em pools --------------------------------------------------------
  const { data: pickemPools } = groupIds.length
    ? await supabase
        .from("pickem_pools")
        .select("id, name, variant, group_id, lock_at, winner_user_id, winner_points, scratched")
        .in("group_id", groupIds)
        .order("lock_at", { ascending: false })
    : { data: [] as any[] };
  const pickemList = (pickemPools ?? []) as any[];
  const guestPickemIds = [...myGuests.pickem].filter(
    (pid) => !pickemList.some((p) => p.id === pid)
  );
  if (guestPickemIds.length) {
    const { data: guestPickemPools } = await supabase
      .from("pickem_pools")
      .select("id, name, variant, group_id, lock_at, winner_user_id, winner_points, scratched")
      .in("id", guestPickemIds);
    pickemList.push(...((guestPickemPools ?? []) as any[]));
  }
  const pickemIds = pickemList.map((p) => p.id);

  // Viewer's pick counts per pool (standard: games picked; over/under:
  // props picked) plus the totals they are picked out of.
  const { data: myPicks } = pickemIds.length
    ? await supabase.from("pickem_picks").select("pool_id, game_id").eq("user_id", user.id).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const myPickCount = new Map<string, number>();
  for (const p of (myPicks ?? []) as any[]) {
    myPickCount.set(p.pool_id, (myPickCount.get(p.pool_id) ?? 0) + 1);
  }
  const { data: links } = pickemIds.length
    ? await supabase.from("pickem_pool_games").select("pool_id, game_id").in("pool_id", pickemIds)
    : { data: [] as any[] };
  const gameCount = new Map<string, number>();
  for (const l of (links ?? []) as any[]) {
    gameCount.set(l.pool_id, (gameCount.get(l.pool_id) ?? 0) + 1);
  }
  const { data: myPropPicks } = pickemIds.length
    ? await supabase.from("pickem_prop_picks").select("pool_id").eq("user_id", user.id).in("pool_id", pickemIds)
    : { data: [] as any[] };
  const myPropCount = new Map<string, number>();
  for (const p of (myPropPicks ?? []) as any[]) {
    myPropCount.set(p.pool_id, (myPropCount.get(p.pool_id) ?? 0) + 1);
  }
  const { data: propLines } = pickemIds.length
    ? await supabase.from("pickem_lines").select("id, pool_id").in("pool_id", pickemIds)
    : { data: [] as any[] };
  const lineCount = new Map<string, number>();
  for (const l of (propLines ?? []) as any[]) {
    lineCount.set(l.pool_id, (lineCount.get(l.pool_id) ?? 0) + 1);
  }

  const boards = new Map<string, { user_id: string; display_name: string; points: number; is_bot?: boolean }[]>();
  await Promise.all(
    pickemList.map(async (p) => {
      try {
        const board = await computePickemLeaderboard(supabase, p.id);
        boards.set(
          p.id,
          board.map((r: any) => ({ user_id: r.user_id, display_name: r.display_name, points: r.points, is_bot: r.is_bot }))
        );
      } catch {
        boards.set(p.id, []);
      }
    })
  );

  // ---- survivor pools ---------------------------------------------------------
  const { data: survivorPools } = groupIds.length
    ? await supabase
        .from("survivor_pools")
        .select("id, name, group_id, season, start_week, created_by")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };
  const survivorList = (survivorPools ?? []) as any[];
  const guestSurvivorIds = [...myGuests.survivor].filter(
    (pid) => !survivorList.some((p) => p.id === pid)
  );
  if (guestSurvivorIds.length) {
    const { data: guestSurvivorPools } = await supabase
      .from("survivor_pools")
      .select("id, name, group_id, season, start_week, created_by")
      .in("id", guestSurvivorIds);
    survivorList.push(...((guestSurvivorPools ?? []) as any[]));
  }
  // Host group names for guest pools — the groups row itself is
  // members-only (it carries the invite token), so names come from the
  // open_pool_hosts view.
  const joinedGuestPoolIds = [...guestPickemIds, ...guestSurvivorIds];
  if (joinedGuestPoolIds.length) {
    const hostNames = await loadHostNames(supabase, joinedGuestPoolIds);
    for (const p of [...pickemList, ...survivorList]) {
      const host = hostNames.get(p.id);
      if (host && !groupName.has(p.group_id)) groupName.set(p.group_id, host);
    }
  }
  const survivorStates = new Map<string, Awaited<ReturnType<typeof computeSurvivorState>>>();
  for (const p of survivorList) {
    survivorStates.set(p.id, await computeSurvivorState(supabase, p));
  }

  // ---- unified list: live/open first, settled last ----------------------------
  type Item = {
    key: string;
    bucket: number; // 0 live/locked, 1 open/upcoming, 2 settled
    sortTime: number;
    node: ReactNode;
  };
  const items: Item[] = [];

  for (const p of pickemList) {
    const settled = !!p.winner_user_id || !!p.scratched;
    const locked = new Date(p.lock_at).getTime() <= now;
    const bucket = settled ? 2 : locked ? 0 : 1;
    const board = boards.get(p.id) ?? [];
    const myIdx = board.findIndex((r) => r.user_id === userId);
    const isOU = p.variant === "over_under";
    const picked = isOU ? (myPropCount.get(p.id) ?? 0) : (myPickCount.get(p.id) ?? 0);
    const total = isOU ? (lineCount.get(p.id) ?? 0) : (gameCount.get(p.id) ?? 0);
    const href = `/groups/${p.group_id}/pickem/${p.id}`;
    const statusLine = settled
      ? p.scratched
        ? "Scratched — no winner"
        : `Settled · +${p.winner_points} pts`
      : locked
        ? "Live"
        : lockLabel(p.lock_at);
    items.push({
      key: `pickem-${p.id}`,
      bucket,
      sortTime: new Date(p.lock_at).getTime(),
      node: (
        <ExpandableCard
          header={
            <div className="flex items-center justify-between gap-2">
              <Link
                href={href}
                className={`truncate font-display text-lg font-semibold uppercase tracking-wide hover:text-orange-700 ${
                  settled ? "text-slate-500" : ""
                }`}
              >
                {p.name}
              </Link>
              <span className="inline-block shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {isOU ? "over/under" : "pick'em"}
              </span>
            </div>
          }
          sub={
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-500">{groupName.get(p.group_id)}</span>
              {" · "}
              {statusLine}
              {!settled && myIdx >= 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-slate-900">
                    {ordinal(myIdx + 1)} of {board.length} · {board[myIdx].points} pts
                  </span>
                </>
              )}
            </p>
          }
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-slate-400">Standings</p>
          <div className="mt-1">
            <StandingRows rows={board.slice(0, 3)} userId={userId} />
          </div>
          {myIdx >= 3 && (
            <p className="mt-1 text-sm text-slate-600">
              You: <span className="font-semibold text-slate-900">{ordinal(myIdx + 1)} · {board[myIdx].points} pts</span>
            </p>
          )}
          <p className="mt-3 border-t border-slate-100 pt-2 text-sm text-slate-600">
            {settled ? (
              <span>Final — {statusLine.toLowerCase()}</span>
            ) : total > 0 ? (
              picked >= total ? (
                <span>
                  <span className="font-semibold text-slate-900">{picked} of {total} picks in</span> — all set
                </span>
              ) : (
                <span>
                  {picked} of {total} picks in ·{" "}
                  <span className="font-semibold text-orange-700">Pick needed</span>
                </span>
              )
            ) : (
              <span>Slate not posted yet</span>
            )}
          </p>
          <Link href={href} className="mt-2 inline-block text-sm font-semibold text-slate-900 hover:text-orange-700">
            Open pool →
          </Link>
        </ExpandableCard>
      ),
    });
  }

  for (const p of survivorList) {
    const st = survivorStates.get(p.id)!;
    const settled = st.decided;
    const started = st.firstKickoff ? new Date(st.firstKickoff).getTime() <= now : false;
    const bucket = settled ? 2 : started ? 0 : 1;
    const mine = st.entries.find((e) => e.user_id === userId);
    const myPick =
      mine && st.currentWeek !== null ? mine.picks.get(st.currentWeek) : undefined;
    const href = `/groups/${p.group_id}/survivor/${p.id}`;
    items.push({
      key: `survivor-${p.id}`,
      bucket,
      sortTime: st.firstKickoff ? new Date(st.firstKickoff).getTime() : now,
      node: (
        <ExpandableCard
          header={
            <div className="flex items-center justify-between gap-2">
              <Link
                href={href}
                className={`truncate font-display text-lg font-semibold uppercase tracking-wide hover:text-orange-700 ${
                  settled ? "text-slate-500" : ""
                }`}
              >
                {p.name}
              </Link>
              <span className="inline-block shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">
                survivor
              </span>
            </div>
          }
          sub={
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-500">{groupName.get(p.group_id)}</span>
              {" · "}
              {settled ? (
                <span>Final</span>
              ) : st.entries.length === 0 ? (
                <span>Starts Week {p.start_week} · no entries yet</span>
              ) : (
                <span>
                  <span className="font-semibold text-slate-900">{st.aliveCount} alive</span>
                  {st.currentWeek !== null ? ` · Week ${st.currentWeek}` : ""}
                </span>
              )}
            </p>
          }
        >
          <p className="text-sm text-slate-600">
            {st.entries.length} {st.entries.length === 1 ? "entry" : "entries"} · {st.aliveCount} alive
            {st.currentWeek !== null && !settled ? ` · Week ${st.currentWeek} in play` : ""}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {!mine ? (
              <span>
                You&rsquo;re not in this one
                {!started && st.entries.length >= 0 ? " — entries close at the first kickoff" : ""}
              </span>
            ) : !mine.alive ? (
              <span>
                You&rsquo;re <span className="font-semibold text-slate-900">out</span>
                {mine.eliminated_week !== null ? ` (Week ${mine.eliminated_week})` : ""}
              </span>
            ) : (
              <span>
                You&rsquo;re <span className="font-semibold text-slate-900">alive</span>
                {st.currentWeek !== null
                  ? myPick
                    ? ` · Week ${st.currentWeek} pick: ${myPick.team}`
                    : ` · Week ${st.currentWeek} pick: `
                  : ""}
                {st.currentWeek !== null && !myPick && (
                  <span className="font-semibold text-orange-700">Pick needed</span>
                )}
              </span>
            )}
          </p>
          <Link href={href} className="mt-3 inline-block text-sm font-semibold text-slate-900 hover:text-orange-700">
            Open pool →
          </Link>
        </ExpandableCard>
      ),
    });
  }

  items.sort((a, b) => a.bucket - b.bucket || (a.bucket === 1 ? a.sortTime - b.sortTime : b.sortTime - a.sortTime));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider text-slate-900">
          Your pools
        </h1>
        <PoolsNewMenu groups={groups} />
      </div>
      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            No pools yet. Start one with + New — pick the group, then the game.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">{items.map((it) => <div key={it.key}>{it.node}</div>)}</div>
      )}
      {openPoolCards.length > 0 && (
        <div className="pt-2">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wider text-slate-900">
            Open pools
          </h2>
          <p className="mb-2 mt-0.5 text-sm text-slate-500">
            Anyone can jump in — guests play the pool, not the group.
          </p>
          <div className="space-y-2">
            {openPoolCards.map((p) => (
              <OpenPoolCard key={`${p.type}-${p.id}`} pool={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
