import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeSurvivorState } from "@/lib/survivor";
import { Card } from "@/components/ui";
import ExpandableCard from "@/components/expandable-card";
import NewGroupMenu from "@/components/new-group-menu";
import NewMenu from "@/components/new-menu";

// Groups tab: every group the user belongs to, expandable in place —
// lifetime board top 3 and what's running, without leaving the list.
// The lifetime-board math is the group page's own (settled bets +
// roster-pool champs + pick'em co-winners), run for all groups at once.

const ET = "America/New_York";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET });
}

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const userId = user.id;
  const now = Date.now();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, groups(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  const groups = ((memberships ?? []) as any[])
    .map((m) => ({ id: (m.groups as any)?.id as string, name: (m.groups as any)?.name as string, role: m.role }))
    .filter((g) => g.id);
  const groupIds = groups.map((g) => g.id);

  // ---- members per group -----------------------------------------------------
  const { data: members } = groupIds.length
    ? await supabase
        .from("group_members")
        .select("group_id, user_id, profiles(display_name)")
        .in("group_id", groupIds)
    : { data: [] as any[] };
  const membersByGroup = new Map<string, { user_id: string; name: string }[]>();
  for (const m of (members ?? []) as any[]) {
    const arr = membersByGroup.get(m.group_id) ?? [];
    arr.push({ user_id: m.user_id, name: m.profiles?.display_name ?? "Player" });
    membersByGroup.set(m.group_id, arr);
  }

  // ---- lifetime points per (group, user) — same sources as the group page ---
  const points = new Map<string, { points: number; wins: number }>();
  const key = (gid: string, uid: string) => `${gid}|${uid}`;
  const add = (gid: string, uid: string | null, pts: number) => {
    if (!uid) return;
    const cur = points.get(key(gid, uid)) ?? { points: 0, wins: 0 };
    cur.points += pts;
    cur.wins += 1;
    points.set(key(gid, uid), cur);
  };
  if (groupIds.length) {
    const { data: settledBets } = await supabase
      .from("bets")
      .select("group_id, points, proposed_winner_id")
      .in("group_id", groupIds)
      .eq("status", "settled");
    for (const b of (settledBets ?? []) as any[]) add(b.group_id, b.proposed_winner_id, b.points);
    const { data: poolWinners } = await supabase
      .from("pools")
      .select("group_id, winner_user_id, winner_points")
      .in("group_id", groupIds)
      .not("winner_user_id", "is", null);
    for (const w of (poolWinners ?? []) as any[]) add(w.group_id, w.winner_user_id, w.winner_points);
    const { data: pickemWinners } = await supabase
      .from("pickem_pool_winners")
      .select("user_id, points, pickem_pools!inner(group_id)")
      .in("pickem_pools.group_id", groupIds);
    for (const w of (pickemWinners ?? []) as any[]) {
      add((w.pickem_pools as any)?.group_id, w.user_id, w.points);
    }
  }

  // ---- pools per group, with status ------------------------------------------
  type PoolLine = { label: string; status: string; bucket: number; href: string; sortTime: number };
  const linesByGroup = new Map<string, PoolLine[]>();
  const pushLine = (gid: string, line: PoolLine) => {
    const arr = linesByGroup.get(gid) ?? [];
    arr.push(line);
    linesByGroup.set(gid, arr);
  };
  if (groupIds.length) {
    const { data: rosterPools } = await supabase
      .from("pools")
      .select("id, name, group_id, lock_at, winner_user_id")
      .in("group_id", groupIds);
    for (const p of (rosterPools ?? []) as any[]) {
      const settled = !!p.winner_user_id;
      const locked = new Date(p.lock_at).getTime() <= now;
      pushLine(p.group_id, {
        label: p.name,
        status: settled ? "settled" : locked ? "Live" : `Opens ${shortDate(p.lock_at)}`,
        bucket: settled ? 2 : locked ? 0 : 1,
        href: `/groups/${p.group_id}/pools/${p.id}`,
        sortTime: new Date(p.lock_at).getTime(),
      });
    }
    const { data: pickemPools } = await supabase
      .from("pickem_pools")
      .select("id, name, group_id, lock_at, winner_user_id, scratched")
      .in("group_id", groupIds);
    for (const p of (pickemPools ?? []) as any[]) {
      const settled = !!p.winner_user_id || !!p.scratched;
      const locked = new Date(p.lock_at).getTime() <= now;
      pushLine(p.group_id, {
        label: p.name,
        status: settled ? "settled" : locked ? "Live" : `Opens ${shortDate(p.lock_at)}`,
        bucket: settled ? 2 : locked ? 0 : 1,
        href: `/groups/${p.group_id}/pickem/${p.id}`,
        sortTime: new Date(p.lock_at).getTime(),
      });
    }
    const { data: survivorPools } = await supabase
      .from("survivor_pools")
      .select("id, name, group_id, season, start_week, created_by")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false });
    for (const p of (survivorPools ?? []) as any[]) {
      const st = await computeSurvivorState(supabase, p);
      const started = st.firstKickoff ? new Date(st.firstKickoff).getTime() <= now : false;
      pushLine(p.group_id, {
        label: p.name,
        status: st.decided ? "settled" : started ? "Live" : `Opens Week ${p.start_week}`,
        bucket: st.decided ? 2 : started ? 0 : 1,
        href: `/groups/${p.group_id}/survivor/${p.id}`,
        sortTime: st.firstKickoff ? new Date(st.firstKickoff).getTime() : now,
      });
    }
  }
  for (const arr of linesByGroup.values()) {
    arr.sort((a, b) => a.bucket - b.bucket || b.sortTime - a.sortTime);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider text-slate-900">
          Your groups
        </h1>
        <NewGroupMenu />
      </div>
      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            No groups yet. Create one or join with an invite link — + New, up top.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const memberList = membersByGroup.get(g.id) ?? [];
            const board = memberList
              .map((m) => ({ ...m, ...(points.get(key(g.id, m.user_id)) ?? { points: 0, wins: 0 }) }))
              .sort((a, b) => b.points - a.points);
            const myIdx = board.findIndex((r) => r.user_id === userId);
            const lines = linesByGroup.get(g.id) ?? [];
            const liveCount = lines.filter((l) => l.bucket === 0).length;
            return (
              <ExpandableCard
                key={g.id}
                header={
                  <Link
                    href={`/groups/${g.id}`}
                    className="block truncate font-display text-lg font-semibold uppercase tracking-wide hover:text-orange-700"
                  >
                    {g.name}
                  </Link>
                }
                sub={
                  <p className="text-sm text-slate-600">
                    {memberList.length} {memberList.length === 1 ? "member" : "members"}
                    {g.role === "admin" ? " · you run this one" : ""}
                    {liveCount > 0 ? ` · ${liveCount} live` : ""}
                  </p>
                }
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-slate-400">
                  Lifetime board
                </p>
                <div className="mt-1">
                  {board.slice(0, 3).map((r, i) => (
                    <div
                      key={r.user_id}
                      className={`flex items-baseline py-1 text-sm ${
                        r.user_id === userId ? "font-semibold text-orange-700" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-xs text-slate-400">{i + 1}</span>
                      <span className="min-w-0 truncate">
                        {r.name}
                        {r.user_id === userId && (
                          <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>
                        )}
                      </span>
                      <span className="ml-auto shrink-0 font-semibold tabular-nums">
                        {r.points} pts
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          · {r.wins} {r.wins === 1 ? "win" : "wins"}
                        </span>
                      </span>
                    </div>
                  ))}
                  {myIdx >= 3 && (
                    <p className="mt-1 text-sm text-slate-600">
                      You:{" "}
                      <span className="font-semibold text-slate-900">
                        {myIdx + 1}. · {board[myIdx].points} pts
                      </span>
                    </p>
                  )}
                </div>

                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.11em] text-slate-400">
                  In this group
                </p>
                <div className="mt-1 space-y-1">
                  {lines.length === 0 && <p className="text-sm text-slate-500">No pools yet.</p>}
                  {lines.slice(0, 6).map((l) => (
                    <p key={l.href} className="text-sm text-slate-600">
                      {l.bucket === 2 ? (
                        <span>
                          <Link href={l.href} className="hover:text-orange-700">{l.label}</Link>
                          {" — settled"}
                        </span>
                      ) : (
                        <span>
                          <span className="font-semibold text-slate-900">{l.status}:</span>{" "}
                          <Link href={l.href} className="hover:text-orange-700">{l.label}</Link>
                        </span>
                      )}
                    </p>
                  ))}
                  {lines.length > 6 && (
                    <p className="text-sm text-slate-400">…and {lines.length - 6} more</p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/groups/${g.id}`}
                    className="text-sm font-semibold text-slate-900 hover:text-orange-700"
                  >
                    Open group →
                  </Link>
                  <NewMenu groupId={g.id} />
                </div>
              </ExpandableCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
