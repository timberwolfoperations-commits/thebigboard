import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { settleOverdueBets } from "@/lib/actions";
import { GRACE_DAYS } from "@/lib/config";
import { Card, SectionTitle, StatusBadge } from "@/components/ui";
import CopyButton from "@/components/copy-button";

function daysOverdue(settleDate: string) {
  const ms = Date.now() - new Date(settleDate + "T23:59:59").getTime();
  return Math.floor(ms / 86400000);
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Lazy auto-settle: first visitor after the deadline triggers it. No cron.
  await settleOverdueBets(id);

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, invite_token")
    .eq("id", id)
    .maybeSingle();
  if (!group) {
    return (
      <Card className="text-center">
        <p className="font-semibold">You&rsquo;re not in this group.</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-slate-600 underline">
          Back to dashboard
        </Link>
      </Card>
    );
  }

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(display_name)")
    .eq("group_id", id);
  const memberList = ((members ?? []) as any[]).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    name: m.profiles?.display_name ?? "Player",
  }));
  const nameOf = (uid: string) => memberList.find((m) => m.user_id === uid)?.name ?? "Player";
  const myRole = memberList.find((m) => m.user_id === user.id)?.role;

  const { data: bets } = await supabase
    .from("bets")
    .select("id, title, description, points, status, settle_date, proposed_winner_id, created_by")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const { data: parts } = await supabase
    .from("bet_participants")
    .select("bet_id, user_id, approved")
    .in("bet_id", (bets ?? []).map((b: any) => b.id));

  const partsByBet = new Map<string, { user_id: string; approved: boolean }[]>();
  for (const p of (parts ?? []) as any[]) {
    const arr = partsByBet.get(p.bet_id) ?? [];
    arr.push(p);
    partsByBet.set(p.bet_id, arr);
  }

  const betList = ((bets ?? []) as any[]).map((b) => ({
    ...b,
    participants: partsByBet.get(b.id) ?? [],
  }));

  // ---- deadbeats: overdue and still not settled ---------------------------
  const deadbeats = betList
    .filter(
      (b) =>
        (b.status === "open" || b.status === "awaiting") &&
        daysOverdue(b.settle_date) > GRACE_DAYS
    )
    .map((b) => {
      const holdingUp =
        b.status === "awaiting"
          ? b.participants.filter((p: any) => !p.approved)
          : b.participants; // nobody even proposed
      return { ...b, holdingUp, days: daysOverdue(b.settle_date) };
    })
    .filter((b) => b.holdingUp.length > 0);

  // ---- leaderboard: lifetime points per member in this group ---------------
  const { data: settled } = await supabase
    .from("bets")
    .select("points, proposed_winner_id")
    .eq("group_id", id)
    .eq("status", "settled");

  const pointsByUser = new Map<string, { points: number; wins: number }>();
  for (const s of (settled ?? []) as any[]) {
    if (!s.proposed_winner_id) continue;
    const cur = pointsByUser.get(s.proposed_winner_id) ?? { points: 0, wins: 0 };
    cur.points += s.points;
    cur.wins += 1;
    pointsByUser.set(s.proposed_winner_id, cur);
  }
  const leaderboard = memberList
    .map((m) => ({ ...m, ...(pointsByUser.get(m.user_id) ?? { points: 0, wins: 0 }) }))
    .sort((a, b) => b.points - a.points);

  const open = betList.filter((b) => b.status === "open");
  const awaiting = betList.filter((b) => b.status === "awaiting");
  const disputed = betList.filter((b) => b.status === "disputed");
  const recentSettled = betList.filter((b) => b.status === "settled").slice(0, 8);

  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${proto}://${host}/join/${group.invite_token}`;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{group.name}</h1>
          <p className="text-sm text-slate-500">
            {memberList.length} {memberList.length === 1 ? "member" : "members"}
            {myRole === "admin" ? " · you're an admin" : ""}
          </p>
        </div>
        <Link
          href={`/groups/${id}/bets/new`}
          className="shrink-0 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + New bet
        </Link>
      </div>

      <div className="mb-8">
        <CopyButton text={inviteUrl} label="Copy invite link" />
      </div>

      {deadbeats.length > 0 && (
        <div>
          <SectionTitle>💀 Deadbeat Board</SectionTitle>
          <div className="space-y-2">
            {deadbeats.map((b) => (
              <Link key={b.id} href={`/groups/${id}/bets/${b.id}`}>
                <Card className="border-red-200 bg-red-50 transition hover:border-red-400">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <span className="shrink-0 text-xs font-semibold text-red-600">
                      {b.days}d overdue
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-red-700">
                    Holding it up: {b.holdingUp.map((p: any) => nameOf(p.user_id)).join(", ")}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {disputed.length > 0 && (
        <div>
          <SectionTitle>🚩 Disputed — needs an admin</SectionTitle>
          <div className="space-y-2">
            {disputed.map((b) => (
              <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Open bets</SectionTitle>
        {open.length === 0 ? (
          <Card><p className="text-sm text-slate-500">Nothing running. Start something.</p></Card>
        ) : (
          <div className="space-y-2">{open.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}</div>
        )}
      </div>

      {awaiting.length > 0 && (
        <div>
          <SectionTitle>Waiting on approvals</SectionTitle>
          <div className="space-y-2">
            {awaiting.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Leaderboard — lifetime points</SectionTitle>
        <Card className="p-0">
          {leaderboard.map((m, i) => (
            <div
              key={m.user_id}
              className={`flex items-center justify-between px-5 py-3 ${i > 0 ? "border-t border-slate-100" : ""} ${m.user_id === user.id ? "bg-slate-50" : ""}`}
            >
              <p className="text-sm font-medium">
                <span className="mr-2 text-slate-400">{i + 1}</span>
                {m.name}
                {m.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
              </p>
              <p className="text-sm">
                <span className="font-bold">{m.points}</span>
                <span className="text-slate-400"> pts · {m.wins} wins</span>
              </p>
            </div>
          ))}
        </Card>
      </div>

      {recentSettled.length > 0 && (
        <div>
          <SectionTitle>Recently settled</SectionTitle>
          <div className="space-y-2">
            {recentSettled.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function BetRow({
  groupId,
  bet,
  nameOf,
}: {
  groupId: string;
  bet: any;
  nameOf: (uid: string) => string;
}) {
  return (
    <Link href={`/groups/${groupId}/bets/${bet.id}`}>
      <Card className="transition hover:border-slate-400">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{bet.title}</p>
          <StatusBadge status={bet.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {bet.participants.map((p: any) => nameOf(p.user_id)).join(" vs ")} · {bet.points} pts
          {bet.status === "settled" && bet.proposed_winner_id && (
            <span className="font-semibold text-green-700"> · 🏆 {nameOf(bet.proposed_winner_id)}</span>
          )}
        </p>
      </Card>
    </Link>
  );
}
