import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { settleOverdueBets, respondToBet } from "@/lib/actions";
import { GRACE_DAYS } from "@/lib/config";
import { Card, SectionTitle, StatusBadge } from "@/components/ui";
import CopyButton from "@/components/copy-button";
import NewMenu from "@/components/new-menu";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import GroupSwitcher from "@/components/group-switcher";
import RememberContext from "@/components/remember-context";
import { loadMyGroups } from "@/lib/my-pools";
import { getRatings } from "@/lib/rating";

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
    .select("bet_id, user_id, approved, accepted")
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
  // Pool champs land here too, same as a bet win.
  const { data: poolWinners } = await supabase
    .from("pools")
    .select("winner_user_id, winner_points")
    .eq("group_id", id)
    .not("winner_user_id", "is", null);
  for (const w of (poolWinners ?? []) as any[]) {
    const cur = pointsByUser.get(w.winner_user_id) ?? { points: 0, wins: 0 };
    cur.points += w.winner_points;
    cur.wins += 1;
    pointsByUser.set(w.winner_user_id, cur);
  }
  // Pick'em champs too — co-winners each land here with their own 10 pts.
  const { data: pickemWinners } = await supabase
    .from("pickem_pool_winners")
    .select("user_id, points, pickem_pools!inner(group_id)")
    .eq("pickem_pools.group_id", id);
  for (const w of (pickemWinners ?? []) as any[]) {
    const cur = pointsByUser.get(w.user_id) ?? { points: 0, wins: 0 };
    cur.points += w.points;
    cur.wins += 1;
    pointsByUser.set(w.user_id, cur);
  }
  // Quiz champs too — same deal, from quiz_winners.
  const { data: quizWinners } = await supabase
    .from("quiz_winners")
    .select("user_id, points, quizzes!inner(group_id)")
    .eq("quizzes.group_id", id);
  for (const w of (quizWinners ?? []) as any[]) {
    const cur = pointsByUser.get(w.user_id) ?? { points: 0, wins: 0 };
    cur.points += w.points;
    cur.wins += 1;
    pointsByUser.set(w.user_id, cur);
  }
  const leaderboard = memberList
    .map((m) => ({ ...m, ...(pointsByUser.get(m.user_id) ?? { points: 0, wins: 0 }) }))
    .sort((a, b) => b.points - a.points);
  const avatars = await getAvatarMap(supabase, memberList.map((m) => m.user_id));
  const ratings = await getRatings(supabase, memberList.map((m) => m.user_id));

  // ---- survivor pools -----------------------------------------------------
  const { data: survivorPools } = await supabase
    .from("survivor_pools")
    .select("id, name, season, start_week")
    .eq("group_id", id)
    .order("created_at", { ascending: false });
  const survivorList = (survivorPools ?? []) as any[];
  const { data: survivorEntries } = survivorList.length
    ? await supabase
        .from("survivor_entries")
        .select("pool_id")
        .in("pool_id", survivorList.map((p) => p.id))
    : { data: [] as any[] };
  const survivorCountByPool = new Map<string, number>();
  for (const e of (survivorEntries ?? []) as any[]) {
    survivorCountByPool.set(e.pool_id, (survivorCountByPool.get(e.pool_id) ?? 0) + 1);
  }

  const open = betList.filter((b) => b.status === "open");
  const pending = betList.filter((b) => b.status === "pending");
  const awaiting = betList.filter((b) => b.status === "awaiting");
  const disputed = betList.filter((b) => b.status === "disputed");
  const recentSettled = betList.filter((b) => b.status === "settled").slice(0, 8);

  // ---- roster pools -------------------------------------------------------
  const { data: pools } = await supabase
    .from("pools")
    .select("id, name, budget, roster_size, lock_at, winner_user_id, winner_points")
    .eq("group_id", id)
    .order("created_at", { ascending: false });
  const openPools = ((pools ?? []) as any[]).filter((p) => !p.winner_user_id);
  const settledPools = ((pools ?? []) as any[]).filter((p) => p.winner_user_id);
  const { data: poolEntries } = await supabase
    .from("pool_entries")
    .select("pool_id")
    .in("pool_id", (pools ?? []).map((p: any) => p.id));
  const entriesByPool = new Map<string, number>();
  for (const e of (poolEntries ?? []) as any[]) {
    entriesByPool.set(e.pool_id, (entriesByPool.get(e.pool_id) ?? 0) + 1);
  }

  // ---- pick'em pools ------------------------------------------------------
  const { data: pickemPools } = await supabase
    .from("pickem_pools")
    .select("id, name, week, season, lock_at, winner_user_id, winner_points, scratched")
    .eq("group_id", id)
    .order("created_at", { ascending: false });
  const openPickem = ((pickemPools ?? []) as any[]).filter((p) => !p.winner_user_id && !p.scratched);
  const settledPickem = ((pickemPools ?? []) as any[]).filter((p) => p.winner_user_id || p.scratched);
  const { data: pickemPicks } = await supabase
    .from("pickem_picks")
    .select("pool_id, user_id")
    .in("pool_id", (pickemPools ?? []).map((p: any) => p.id));
  const pickersByPool = new Map<string, Set<string>>();
  for (const pk of (pickemPicks ?? []) as any[]) {
    if (!pickersByPool.has(pk.pool_id)) pickersByPool.set(pk.pool_id, new Set());
    pickersByPool.get(pk.pool_id)!.add(pk.user_id);
  }

  // ---- quizzes -------------------------------------------------------------
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, category_label, question_count, close_at, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false });
  const quizList = ((quizzes ?? []) as any[]).slice(0, 8);
  const { data: quizRuns } = quizList.length
    ? await supabase
        .from("quiz_runs")
        .select("quiz_id, finished_at")
        .in("quiz_id", quizList.map((q) => q.id))
    : { data: [] as any[] };
  const playedByQuiz = new Map<string, number>();
  for (const r of (quizRuns ?? []) as any[]) {
    if (!r.finished_at) continue;
    playedByQuiz.set(r.quiz_id, (playedByQuiz.get(r.quiz_id) ?? 0) + 1);
  }
  const { data: quizWinnerRows } = quizList.length
    ? await supabase
        .from("quiz_winners")
        .select("quiz_id, user_id")
        .in("quiz_id", quizList.map((q) => q.id))
    : { data: [] as any[] };
  const quizWinnersByQuiz = new Map<string, string[]>();
  for (const w of (quizWinnerRows ?? []) as any[]) {
    const arr = quizWinnersByQuiz.get(w.quiz_id) ?? [];
    arr.push(nameOf(w.user_id));
    quizWinnersByQuiz.set(w.quiz_id, arr);
  }

  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${proto}://${host}/join/${group.invite_token}`;

  const myGroups = await loadMyGroups(supabase, user.id);

  return (
    <div className="space-y-8">
      <RememberContext groupId={id} />
      <div className="space-y-4">
        <div>
          <GroupSwitcher groups={myGroups} currentId={id} memberCount={memberList.length} />
          {myRole === "admin" && (
            <p className="mt-1 text-sm text-slate-500">You&apos;re an admin</p>
          )}
        </div>
        <div className="flex justify-center gap-2">
          <CopyButton text={inviteUrl} label="Copy invite link" />
          <NewMenu groupId={id} />
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <SectionTitle>Pending invites</SectionTitle>
          <div className="space-y-2">
            {pending.map((b) => (
              <PendingBetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} userId={user.id} />
            ))}
          </div>
        </div>
      )}

      {deadbeats.length > 0 && (
        <div>
          <SectionTitle>Deadbeat Board</SectionTitle>
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
          <SectionTitle>Disputed — needs an admin</SectionTitle>
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
          <Card><p className="text-sm text-slate-500">No action on the board. Fix that.</p></Card>
        ) : (
          <div className="space-y-2">{open.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}</div>
        )}
      </div>

      {(openPools.length > 0 || openPickem.length > 0 || survivorList.length > 0) && (
        <div>
          <SectionTitle>Pools</SectionTitle>
          <div className="space-y-2">
            {openPools.map((p: any) => {
              const locked = new Date(p.lock_at).getTime() <= Date.now();
              const n = entriesByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pools/${p.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{p.name}</p>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          locked ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {locked ? "locked" : "open"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      ${p.budget} cap · {p.roster_size} players · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </Card>
                </Link>
              );
            })}
            {openPickem.map((p: any) => {
              const locked = new Date(p.lock_at).getTime() <= Date.now();
              const n = pickersByPool.get(p.id)?.size ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pickem/${p.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{p.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          pick&rsquo;em
                        </span>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            locked ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {locked ? "locked" : "open"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {p.week ? `Week ${p.week} · ` : ""}
                      {n} {n === 1 ? "picker" : "pickers"}
                    </p>
                  </Card>
                </Link>
              );
            })}
            {survivorList.map((p: any) => {
              const n = survivorCountByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/survivor/${p.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{p.name}</p>
                      <span className="inline-block shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
                        survivor
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Starts Week {p.start_week} · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {quizList.length > 0 && (
        <div>
          <SectionTitle>Quizzes</SectionTitle>
          <div className="space-y-2">
            {quizList.map((q: any) => {
              const closed = new Date(q.close_at).getTime() <= Date.now();
              const played = playedByQuiz.get(q.id) ?? 0;
              const champs = quizWinnersByQuiz.get(q.id) ?? [];
              return (
                <Link key={q.id} href={`/groups/${id}/quiz/${q.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{q.title}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className="inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
                          quiz
                        </span>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            closed ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {closed ? "closed" : "open"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {q.category_label} · {q.question_count} questions ·{" "}
                      {champs.length > 0 ? (
                        <>
                          {champs.join(", ")} won · +10 pts · {played}{" "}
                          {played === 1 ? "run" : "runs"}
                        </>
                      ) : closed ? (
                        <>
                          Closed · {played} {played === 1 ? "run" : "runs"}
                        </>
                      ) : (
                        <>
                          Closes{" "}
                          {new Date(q.close_at).toLocaleDateString("en-US", {
                            timeZone: "America/New_York",
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          · {played} played
                        </>
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

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
              <p className="flex items-center gap-2.5">
                <span className="font-display text-lg font-semibold tabular-nums text-slate-400">{i + 1}</span>
                <Avatar name={m.name} animal={avatars.get(m.user_id)} size={28} />
                <span className="text-sm font-medium">
                  {m.name}
                  {m.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                </span>
              </p>
              <div className="flex items-center gap-5">
                <p className="text-right">
                  <span
                    className={`block font-display text-xl font-semibold tabular-nums leading-none ${
                      ratings.get(m.user_id)?.rating != null ? "text-slate-700" : "text-slate-400"
                    }`}
                  >
                    {ratings.get(m.user_id)?.rating ?? "NR"}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    RTG
                  </span>
                </p>
                <p className="flex items-baseline gap-1.5">
                  <span className={`font-display text-3xl font-bold tabular-nums leading-none ${i === 0 ? "text-accent" : ""}`}>
                    {m.points}
                  </span>
                  <span className="text-xs text-slate-400">
                    pts · {m.wins} {m.wins === 1 ? "win" : "wins"}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {(settledPools.length > 0 || settledPickem.length > 0) && (
        <div>
          <SectionTitle>Settled pools</SectionTitle>
          <div className="space-y-2">
            {settledPools.map((p: any) => {
              const n = entriesByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pools/${p.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{p.name}</p>
                      <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                        settled
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {nameOf(p.winner_user_id)} won · +{p.winner_points} pts · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </Card>
                </Link>
              );
            })}
            {settledPickem.map((p: any) => {
              const n = pickersByPool.get(p.id)?.size ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pickem/${p.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{p.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          pick&rsquo;em
                        </span>
                        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                          settled
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {p.scratched ? (
                        <>Scratched — no winner · {n} {n === 1 ? "picker" : "pickers"}</>
                      ) : (
                        <>{nameOf(p.winner_user_id)} won · +{p.winner_points} pts · {n} {n === 1 ? "picker" : "pickers"}</>
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

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

function PendingBetRow({
  groupId,
  bet,
  nameOf,
  userId,
}: {
  groupId: string;
  bet: any;
  nameOf: (uid: string) => string;
  userId: string;
}) {
  const accept = respondToBet.bind(null, bet.id, true);
  const decline = respondToBet.bind(null, bet.id, false);
  const waitingOn = bet.participants.filter((p: any) => !p.accepted);
  const imWaiting = waitingOn.some((p: any) => p.user_id === userId);

  return (
    <Card className="border-amber-200 bg-amber-50">
      <Link
        href={`/groups/${groupId}/bets/${bet.id}`}
        className="font-display text-lg font-semibold uppercase tracking-wide hover:underline"
      >
        {bet.title}
      </Link>
      <p className="mt-1 text-sm text-slate-600">
        {bet.points} pts · waiting on {waitingOn.map((p: any) => nameOf(p.user_id)).join(", ")}
      </p>
      {imWaiting && (
        <div className="mt-3 flex gap-2">
          <form action={accept}>
            <button className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              Accept
            </button>
          </form>
          <form action={decline}>
            <button className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">
              Decline
            </button>
          </form>
        </div>
      )}
    </Card>
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
          <p className="font-display text-lg font-semibold uppercase tracking-wide">{bet.title}</p>
          <StatusBadge status={bet.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {bet.participants.map((p: any) => nameOf(p.user_id)).join(" vs ")} · {bet.points} pts
          {bet.status === "settled" && bet.proposed_winner_id && (
            <span className="font-semibold text-accent"> · {nameOf(bet.proposed_winner_id)} wins</span>
          )}
        </p>
      </Card>
    </Link>
  );
}
