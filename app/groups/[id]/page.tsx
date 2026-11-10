import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { settleOverdueBets, respondToBet } from "@/lib/actions";
import { GRACE_DAYS } from "@/lib/config";
import { Card, StatusBadge } from "@/components/ui";
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

// Local section heading, one notch down from the shared SectionTitle —
// this page now runs at the season page's Poolr density (compact rows,
// modest type), so it carries its own heading rather than changing the
// shared component (same pattern as the season page).
function GroupSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wider text-slate-900">
      {children}
    </h2>
  );
}

// Shared tile for the page's list rows — a plain div, not Card, so the
// condensed padding is exact (Card bakes in p-5 / bg-white, which win
// the cascade over overrides; see the season page's dark-tile lesson).
const tileClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition hover:border-slate-400";
const tileTitleClass =
  "font-display text-[15px] font-semibold uppercase tracking-wide";
const tileSubClass = "mt-0.5 text-[13px] text-slate-600";
const chipClass =
  "inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold";

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
    { data: seasonRoundRows },
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
    // Season linkage for this group: pools attached to a season are
    // rounds — they live on the season page, so the settled-pools list
    // below leaves them out. Tolerant like the seasons block further
    // down: no table / no seasons -> empty set, page unchanged.
    supabase
      .from("pickem_season_rounds")
      .select("pool_id, pickem_seasons!inner(group_id)")
      .eq("pickem_seasons.group_id", id),
  ]);
  const survivorList = (survivorPools ?? []) as any[];
  const seasonPoolIds = new Set(
    ((seasonRoundRows ?? []) as any[]).map((r) => r.pool_id as string)
  );
  // Quizzes: open ones always show; closed ones cap at the most recent
  // 4 (the rest collapse into a "+N earlier quiz nights" line) so a
  // long quiz history can't bury the page. List order stays
  // created_at desc, same as the query.
  const allQuizzes = (quizzes ?? []) as any[];
  const quizNow = Date.now();
  const closedQuizTotal = allQuizzes.filter(
    (q) => new Date(q.close_at).getTime() <= quizNow
  ).length;
  let closedQuizShown = 0;
  const quizList = allQuizzes.filter((q) => {
    if (new Date(q.close_at).getTime() > quizNow) return true;
    closedQuizShown += 1;
    return closedQuizShown <= 4;
  });
  const earlierQuizCount = Math.max(0, closedQuizTotal - 4);
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
  // Settled list excludes season rounds (see seasonPoolIds above).
  const settledPickem = ((pickemPools ?? []) as any[]).filter(
    (p) => (p.winner_user_id || p.scratched) && !seasonPoolIds.has(p.id)
  );
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
  // Running tables surface under Happening now; finished ones stay in
  // the Poker list below.
  const runningPoker = pokerList.filter((t: any) => t.status !== "complete");
  const finishedPoker = pokerList.filter((t: any) => t.status === "complete");

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

  // ---- my all-time hero ---------------------------------------------------
  // The viewer is a member whenever this page renders (non-members get
  // the "not in this group" card above), so their leaderboard row is
  // the hero's data; guard anyway and skip the tile if it's absent.
  const myRow = leaderboard.find((m) => m.user_id === user.id);
  const myRating = ratings.get(user.id);
  const anythingLive =
    seasonCards.length > 0 ||
    open.length > 0 ||
    openPools.length > 0 ||
    openPickem.length > 0 ||
    survivorList.length > 0 ||
    runningPoker.length > 0;

  return (
    <div className="space-y-5">
      <RememberContext groupId={id} />

      {/* ---- header -------------------------------------------------- */}
      <div>
        <GroupSwitcher groups={myGroups} currentId={id} memberCount={memberList.length} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyButton text={inviteUrl} label="Copy invite link" />
          <NewMenu groupId={id} />
          {myRole === "admin" && (
            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              You&rsquo;re an admin
            </span>
          )}
        </div>
      </div>

      {/* ---- your all-time points hero ------------------------------- */}
      {/* Dark tile as a plain div, NOT Card (Card's baked-in bg-white
          wins the cascade over a dark override — the season page's
          lesson). Mirrors the season hero: one billboard number,
          everything else small. */}
      {myRow && (
        <div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Your all-time points
            </p>
            <div className="mt-1.5 flex flex-wrap items-end gap-x-5 gap-y-1">
              <p className="font-display text-7xl font-bold tabular-nums leading-none">
                {myRow.points}
              </p>
              <div className="pb-1">
                <p className="font-display text-2xl font-semibold leading-none">
                  {myRow.wins} {myRow.wins === 1 ? "win" : "wins"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  RTG {myRating?.rating != null ? myRating.rating : "not rated"}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Points land when a contest ends — the season champion banks theirs after
            the final round.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <GroupSectionTitle>Pending invites</GroupSectionTitle>
          <div className="space-y-2">
            {pending.map((b) => (
              <PendingBetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} userId={user.id} />
            ))}
          </div>
        </div>
      )}

      {deadbeats.length > 0 && (
        <div>
          <GroupSectionTitle>Deadbeat Board</GroupSectionTitle>
          <div className="space-y-2">
            {deadbeats.map((b) => (
              <Link key={b.id} href={`/groups/${id}/bets/${b.id}`}>
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 shadow-sm transition hover:border-red-400">
                  <div className="flex items-center justify-between gap-2">
                    <p className={tileTitleClass}>{b.title}</p>
                    <span className="shrink-0 text-[11px] font-semibold text-red-600">
                      {b.days}d overdue
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-red-700">
                    Holding it up: {b.holdingUp.map((p: any) => nameOf(p.user_id)).join(", ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {disputed.length > 0 && (
        <div>
          <GroupSectionTitle>Disputed — needs an admin</GroupSectionTitle>
          <div className="space-y-2">
            {disputed.map((b) => (
              <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />
            ))}
          </div>
        </div>
      )}

      {awaiting.length > 0 && (
        <div>
          <GroupSectionTitle>Waiting on approvals</GroupSectionTitle>
          <div className="space-y-2">
            {awaiting.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}
          </div>
        </div>
      )}

      {/* ---- happening now ------------------------------------------- */}
      {anythingLive && (
        <div>
          <GroupSectionTitle>Happening now</GroupSectionTitle>
          <div className="space-y-2">
            {seasonCards.map((s) => (
              <Link key={s.id} href={`/groups/${id}/pickem/season/${s.id}`}>
                <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3.5 shadow-sm text-white transition hover:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base font-semibold uppercase tracking-wide">
                      {s.name}
                    </p>
                    <span className="inline-block shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-900">
                      {s.focusRoundNo
                        ? `Round ${s.focusRoundNo} of ${s.roundsTotal}`
                        : `${s.roundsTotal} rounds`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-slate-300">
                    {s.myRecord
                      ? `Your record: ${s.myRecord} — tap for the full race.`
                      : "The season race — standings, rounds, and your record in one place."}
                  </p>
                </div>
              </Link>
            ))}
            {openPools.map((p: any) => {
              const locked = new Date(p.lock_at).getTime() <= Date.now();
              const n = entriesByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pools/${p.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{p.name}</p>
                      <span
                        className={`${chipClass} ${
                          locked ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {locked ? "locked" : "open"}
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      ${p.budget} cap · {p.roster_size} players · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                </Link>
              );
            })}
            {openPickem.map((p: any) => {
              const locked = new Date(p.lock_at).getTime() <= Date.now();
              const n = pickersByPool.get(p.id)?.size ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pickem/${p.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{p.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className={`${chipClass} bg-emerald-100 text-emerald-800`}>
                          pick&rsquo;em
                        </span>
                        <span
                          className={`${chipClass} ${
                            locked ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {locked ? "locked" : "open"}
                        </span>
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      {p.week ? `Week ${p.week} · ` : ""}
                      {n} {n === 1 ? "picker" : "pickers"}
                    </p>
                  </div>
                </Link>
              );
            })}
            {survivorList.map((p: any) => {
              const n = survivorCountByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/survivor/${p.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{p.name}</p>
                      <span className={`${chipClass} bg-orange-100 text-orange-900`}>
                        survivor
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      Starts Week {p.start_week} · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                </Link>
              );
            })}
            {runningPoker.map((t: any) => {
              const n = seatedByTable.get(t.id) ?? 0;
              return (
                <Link key={t.id} href={`/groups/${id}/poker/${t.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{t.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className={`${chipClass} bg-slate-900 text-white`}>poker</span>
                        <span className={`${chipClass} bg-blue-100 text-blue-800`}>running</span>
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      Hand {t.hand_no} · {n} at the table · blinds climbing
                    </p>
                  </div>
                </Link>
              );
            })}
            {open.map((b) => <BetRow key={b.id} groupId={id} bet={b} nameOf={nameOf} />)}
          </div>
        </div>
      )}

      {quizList.length > 0 && (
        <div>
          <GroupSectionTitle>Quizzes</GroupSectionTitle>
          <div className="space-y-2">
            {quizList.map((q: any) => {
              const closed = new Date(q.close_at).getTime() <= Date.now();
              const played = playedByQuiz.get(q.id) ?? 0;
              const champs = quizWinnersByQuiz.get(q.id) ?? [];
              return (
                <Link key={q.id} href={`/groups/${id}/quiz/${q.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{q.title}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className={`${chipClass} bg-violet-100 text-violet-800`}>
                          quiz
                        </span>
                        <span
                          className={`${chipClass} ${
                            closed ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {closed ? "closed" : "open"}
                        </span>
                      </span>
                    </div>
                    <p className={tileSubClass}>
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
                  </div>
                </Link>
              );
            })}
          </div>
          {earlierQuizCount > 0 && (
            <p className="mt-2 text-[13px] text-slate-400">
              +{earlierQuizCount} earlier quiz {earlierQuizCount === 1 ? "night" : "nights"}
            </p>
          )}
        </div>
      )}

      {finishedPoker.length > 0 && (
        <div>
          <GroupSectionTitle>Poker</GroupSectionTitle>
          <div className="space-y-2">
            {finishedPoker.map((t: any) => {
              const n = seatedByTable.get(t.id) ?? 0;
              return (
                <Link key={t.id} href={`/groups/${id}/poker/${t.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{t.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className={`${chipClass} bg-slate-900 text-white`}>poker</span>
                        <span className={`${chipClass} bg-slate-100 text-slate-500`}>
                          finished
                        </span>
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      {nameOf(t.winner_user_id)} took it down · +10 pts · {n} seated
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- leaderboard: the group's permanent scoreboard ------------ */}
      <div>
        <GroupSectionTitle>Leaderboard — lifetime points</GroupSectionTitle>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="min-w-0 flex-1">Plr</span>
            <span className="w-8 text-right">Pts</span>
            <span className="w-9 text-right">Wins</span>
            <span className="w-8 text-right">Rtg</span>
          </div>
          <div className="divide-y divide-slate-100">
            {leaderboard.map((m) => {
              const r = ratings.get(m.user_id)?.rating;
              return (
                <div
                  key={m.user_id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${m.user_id === user.id ? "bg-orange-50" : ""}`}
                >
                  <p className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Avatar name={m.name} animal={avatars.get(m.user_id)} size={24} />
                    <span className="min-w-0 truncate text-[13px] font-medium">{m.name}</span>
                    {m.user_id === user.id && (
                      <span className="shrink-0 rounded bg-orange-100 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-accent">
                        You
                      </span>
                    )}
                  </p>
                  <span className="w-8 text-right text-[13px] font-semibold tabular-nums">
                    {m.points}
                  </span>
                  <span className="w-9 text-right text-[13px] tabular-nums text-slate-500">
                    {m.wins}
                  </span>
                  <span
                    className={`w-8 text-right text-[13px] tabular-nums ${r != null ? "" : "text-slate-400"}`}
                  >
                    {r ?? "NR"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(settledPools.length > 0 || settledPickem.length > 0) && (
        <div>
          <GroupSectionTitle>Settled pools</GroupSectionTitle>
          <div className="space-y-2">
            {settledPools.map((p: any) => {
              const n = entriesByPool.get(p.id) ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pools/${p.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{p.name}</p>
                      <span className={`${chipClass} bg-slate-100 text-slate-500`}>
                        settled
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      {nameOf(p.winner_user_id)} won · +{p.winner_points} pts · {n} {n === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                </Link>
              );
            })}
            {settledPickem.map((p: any) => {
              const n = pickersByPool.get(p.id)?.size ?? 0;
              return (
                <Link key={p.id} href={`/groups/${id}/pickem/${p.id}`}>
                  <div className={tileClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={tileTitleClass}>{p.name}</p>
                      <span className="flex shrink-0 gap-1">
                        <span className={`${chipClass} bg-emerald-100 text-emerald-800`}>
                          pick&rsquo;em
                        </span>
                        <span className={`${chipClass} bg-slate-100 text-slate-500`}>
                          settled
                        </span>
                      </span>
                    </div>
                    <p className={tileSubClass}>
                      {p.scratched ? (
                        <>Scratched — no winner · {n} {n === 1 ? "picker" : "pickers"}</>
                      ) : (
                        <>{nameOf(p.winner_user_id)} won · +{p.winner_points} pts · {n} {n === 1 ? "picker" : "pickers"}</>
                      )}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {recentSettled.length > 0 && (
        <div>
          <GroupSectionTitle>Recently settled</GroupSectionTitle>
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
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <Link
        href={`/groups/${groupId}/bets/${bet.id}`}
        className="font-display text-[15px] font-semibold uppercase tracking-wide hover:underline"
      >
        {bet.title}
      </Link>
      <p className="mt-0.5 text-[13px] text-slate-600">
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
      <div className={tileClass}>
        <div className="flex items-center justify-between gap-2">
          <p className={tileTitleClass}>{bet.title}</p>
          <StatusBadge status={bet.status} />
        </div>
        <p className={tileSubClass}>
          {bet.participants.map((p: any) => nameOf(p.user_id)).join(" vs ")} · {bet.points} pts
          {bet.status === "settled" && bet.proposed_winner_id && (
            <span className="font-semibold text-accent"> · {nameOf(bet.proposed_winner_id)} wins</span>
          )}
        </p>
      </div>
    </Link>
  );
}
