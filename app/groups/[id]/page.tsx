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
import { getGroupLifetime } from "@/lib/lifetime";
import {
  loadGroupSeasons,
  loadSeason,
  loadRoundGameStates,
  computeSeasonStandings,
  pickFocusRoundNo,
} from "@/lib/season";

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
  // Same five sources as lib/lifetime.ts — this page used to carry its own
  // inline copy of that sum (five more serial queries, including a second
  // fetch of the settled bets this page already loaded above). One shared
  // implementation now, fetched as a single parallel batch.
  const pointsByUser = await getGroupLifetime(supabase, id);
  const leaderboard = memberList
    .map((m) => ({ ...m, ...(pointsByUser.get(m.user_id) ?? { points: 0, wins: 0 }) }))
    .sort((a, b) => b.points - a.points);
  const memberIds = memberList.map((m) => m.user_id);
  // Avatars and ratings are independent reads over the same member list.
  const [avatars, ratings] = await Promise.all([
    getAvatarMap(supabase, memberIds),
    getRatings(supabase, memberIds),
  ]);

  // ---- section lists --------------------------------------------------------
  // Survivor, roster pools, pick'em, quizzes, poker: the five list
  // queries are independent (all keyed on the group id), and each
  // section's count query only needs its own list — so the page fetches
  // all lists in one batch, then all counts in a second batch, instead
  // of ten serial round trips.
  const [
    { data: survivorPools },
    { data: pools },
    { data: pickemPools },
    { data: quizzes },
    { data: pokerTables },
  ] = await Promise.all([
    supabase
      .from("survivor_pools")
      .select("id, name, season, start_week")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pools")
      .select("id, name, budget, roster_size, lock_at, winner_user_id, winner_points")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pickem_pools")
      .select("id, name, week, season, lock_at, winner_user_id, winner_points, scratched")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quizzes")
      .select("id, title, category_label, question_count, close_at, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("poker_tables")
      .select("id, name, status, hand_no, winner_user_id, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const survivorList = (survivorPools ?? []) as any[];
  const quizList = ((quizzes ?? []) as any[]).slice(0, 8);
  const pokerList = ((pokerTables ?? []) as any[]).slice(0, 8);

  const [
    { data: survivorEntries },
    { data: poolEntries },
    { data: pickemPicks },
    { data: quizRuns },
    { data: quizWinnerRows },
    { data: pokerSeatRows },
  ] = await Promise.all([
    survivorList.length
      ? supabase
          .from("survivor_entries")
          .select("pool_id")
          .in("pool_id", survivorList.map((p) => p.id))
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("pool_entries")
      .select("pool_id")
      .in("pool_id", (pools ?? []).map((p: any) => p.id)),
    supabase
      .from("pickem_picks")
      .select("pool_id, user_id")
      .in("pool_id", (pickemPools ?? []).map((p: any) => p.id)),
    quizList.length
      ? supabase
          .from("quiz_runs")
          .select("quiz_id, finished_at")
          .in("quiz_id", quizList.map((q) => q.id))
      : Promise.resolve({ data: [] as any[] }),
    quizList.length
      ? supabase
          .from("quiz_winners")
          .select("quiz_id, user_id")
          .in("quiz_id", quizList.map((q) => q.id))
      : Promise.resolve({ data: [] as any[] }),
    pokerList.length
      ? supabase
          .from("poker_seats")
          .select("table_id")
          .in("table_id", pokerList.map((t) => t.id))
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // ---- survivor pools -----------------------------------------------------
  const survivorCountByPool = new Map<string, number>();
  for (const e of (survivorEntries ?? []) as any[]) {
    survivorCountByPool.set(e.pool_id, (survivorCountByPool.get(e.pool_id) ?? 0) + 1);
  }

  const open = betList.filter((b) => b.status === "open");
  const pending = betList.filter((b) => b.status === "pending");
  const awaiting = betList.filter((b) => b.status === "awaiting");
  const disputed = betList.filter((b) => b.status === "disputed");
  const recentSettled = betList.filter((b) => b.status === "settled").slice(0, 8);

  // ---- roster pools (lists + counts fetched in the batches above) --------
  const openPools = ((pools ?? []) as any[]).filter((p) => !p.winner_user_id);
  const settledPools = ((pools ?? []) as any[]).filter((p) => p.winner_user_id);
  const entriesByPool = new Map<string, number>();
  for (const e of (poolEntries ?? []) as any[]) {
    entriesByPool.set(e.pool_id, (entriesByPool.get(e.pool_id) ?? 0) + 1);
  }

  // ---- pick'em pools ------------------------------------------------------
  const openPickem = ((pickemPools ?? []) as any[]).filter((p) => !p.winner_user_id && !p.scratched);
  const settledPickem = ((pickemPools ?? []) as any[]).filter((p) => p.winner_user_id || p.scratched);
  const pickersByPool = new Map<string, Set<string>>();
  for (const pk of (pickemPicks ?? []) as any[]) {
    if (!pickersByPool.has(pk.pool_id)) pickersByPool.set(pk.pool_id, new Set());
    pickersByPool.get(pk.pool_id)!.add(pk.user_id);
  }

  // ---- quizzes -------------------------------------------------------------
  const playedByQuiz = new Map<string, number>();
  for (const r of (quizRuns ?? []) as any[]) {
    if (!r.finished_at) continue;
    playedByQuiz.set(r.quiz_id, (playedByQuiz.get(r.quiz_id) ?? 0) + 1);
  }
  const quizWinnersByQuiz = new Map<string, string[]>();
  for (const w of (quizWinnerRows ?? []) as any[]) {
    const arr = quizWinnersByQuiz.get(w.quiz_id) ?? [];
    arr.push(nameOf(w.user_id));
    quizWinnersByQuiz.set(w.quiz_id, arr);
  }

  // ---- poker tables ---------------------------------------------------------
  const seatedByTable = new Map<string, number>();
  for (const s of (pokerSeatRows ?? []) as any[]) {
    seatedByTable.set(s.table_id, (seatedByTable.get(s.table_id) ?? 0) + 1);
  }

  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${proto}://${host}/join/${group.invite_token}`;

  const myGroups = await loadMyGroups(supabase, user.id);

  // ---- seasons ------------------------------------------------------------
  // A season is the race view over this group's weekly pick'em pools.
  // Tolerant by construction: no seasons (or migration 029 not run
  // yet) -> empty list, no card, page unchanged.
  const groupSeasons = await loadGroupSeasons(supabase, id);
  const seasonCards: {
    id: string;
    name: string;
    roundsTotal: number;
    focusRoundNo: number | null;
    myRecord: string | null;
  }[] = [];
  for (const s of groupSeasons) {
    const loadedSeason = await loadSeason(supabase, s.id);
    if (!loadedSeason) continue;
    const [standings, states] = await Promise.all([
      computeSeasonStandings(supabase, loadedSeason),
      loadRoundGameStates(supabase, loadedSeason.rounds, user.id),
    ]);
    const mine = standings.find((x) => x.user_id === user.id);
    seasonCards.push({
      id: s.id,
      name: s.name,
      roundsTotal: s.rounds_total,
      focusRoundNo: pickFocusRoundNo(
        loadedSeason.rounds.map((r) => ({
          roundNo: r.round_no,
          allFinal: states.get(r.pool_id)?.allFinal ?? false,
          unpickedUpcoming: states.get(r.pool_id)?.myUnpickedUpcoming ?? 0,
        }))
      ),
      myRecord:
        mine && mine.picksMade > 0 ? `${mine.correct}–${mine.missed}` : null,
    });
  }

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

      {seasonCards.length > 0 && (
        <div>
          <SectionTitle>Season</SectionTitle>
          <div className="space-y-2">
            {seasonCards.map((s) => (
              <Link key={s.id} href={`/groups/${id}/pickem/season/${s.id}`}>
                <div className="rounded-2xl border border-slate-900 bg-slate-900 p-5 shadow-sm text-white transition hover:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-semibold uppercase tracking-wide">
                      {s.name}
                    </p>
                    <span className="inline-block shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-900">
                      {s.focusRoundNo
                        ? `Round ${s.focusRoundNo} of ${s.roundsTotal}`
                        : `${s.roundsTotal} rounds`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {s.myRecord
                      ? `Your record: ${s.myRecord} — tap for the full race.`
                      : "The season race — standings, rounds, and your record in one place."}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

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

      {pokerList.length > 0 && (
        <div>
          <SectionTitle>Poker</SectionTitle>
          <div className="space-y-2">
            {pokerList.map((t: any) => {
              const n = seatedByTable.get(t.id) ?? 0;
              const done = t.status === "complete";
              return (
                <Link key={t.id} href={`/groups/${id}/poker/${t.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-semibold uppercase tracking-wide">{t.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className="inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                          poker
                        </span>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            done ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {done ? "finished" : "running"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {done ? (
                        <>
                          {nameOf(t.winner_user_id)} took it down · +10 pts · {n} seated
                        </>
                      ) : (
                        <>
                          Hand {t.hand_no} · {n} at the table · blinds climbing
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
