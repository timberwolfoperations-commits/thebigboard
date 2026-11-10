import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  loadSeason,
  loadRoundGameStates,
  computeSeasonStandings,
  pickFocusRoundNo,
  type SeasonStanding,
} from "@/lib/season";
import { attachPoolToSeason } from "@/lib/season-actions";
import { creationLockedFor } from "@/lib/commissioner";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import { Card, SubmitButton, fieldClass } from "@/components/ui";

// Local section heading, one notch down from the shared SectionTitle —
// the season page runs at Poolr density (compact rows, modest type), so
// it carries its own heading rather than changing the shared component.
function SeasonSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wider text-slate-900">
      {children}
    </h2>
  );
}

// The season home: Poolr's one-screen season, in Big Board's clothes.
// The season is an ACTIVITY view — your record, the current round, the
// race, the round-by-round story. The group's lifetime board and
// rating stay on the group page, where the permanent scoreboard lives.
// Everything here is derived at read from the round pools; picking
// itself happens on each round's existing pool page.

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string; seasonId: string }>;
}) {
  const { id, seasonId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const loaded = await loadSeason(supabase, seasonId);
  if (!loaded) {
    // Season missing — or migration 029 hasn't run yet. Either way,
    // a clean explanation, never a white screen.
    return (
      <Card className="text-center">
        <p className="font-semibold">This season isn&rsquo;t set up yet.</p>
        <p className="mt-1 text-sm text-slate-500">
          Once the season is created, this page holds the whole race — record, rounds, and
          standings in one place.
        </p>
        <Link href={`/groups/${id}`} className="mt-3 inline-block text-sm text-slate-600 underline">
          Back to the group
        </Link>
      </Card>
    );
  }
  const { season, rounds } = loaded;
  if (season.group_id !== id) {
    redirect(`/groups/${season.group_id}/pickem/season/${seasonId}`);
  }

  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return (
      <Card className="text-center">
        <p className="font-semibold">You&rsquo;re not in this group.</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-slate-600 underline">
          Back to dashboard
        </Link>
      </Card>
    );
  }
  const myRole = membership.role as "admin" | "member";

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const [standings, gameStates] = await Promise.all([
    computeSeasonStandings(supabase, loaded),
    loadRoundGameStates(supabase, rounds, user.id),
  ]);
  const avatars = await getAvatarMap(
    supabase,
    standings.map((s) => s.user_id)
  );

  // The focus round is the ACTIONABLE one for this viewer (roll-forward
  // rule): the earliest round with unpicked games that haven't kicked
  // off — a fresh round beats a still-pending earlier round for a
  // viewer who's done there. Header progress follows the same round.
  const focusRoundNo = pickFocusRoundNo(
    rounds.map((r) => ({
      roundNo: r.round_no,
      allFinal: gameStates.get(r.pool_id)?.allFinal ?? false,
      unpickedUpcoming: gameStates.get(r.pool_id)?.myUnpickedUpcoming ?? 0,
    }))
  );
  const focusRound = rounds.find((r) => r.round_no === focusRoundNo) ?? null;
  const focusState = focusRound ? gameStates.get(focusRound.pool_id) : null;

  const myStanding: SeasonStanding | undefined = standings.find((s) => s.user_id === user.id);
  const myRank = myStanding ? standings.indexOf(myStanding) + 1 : null;

  // Per-round and independent: a round's status comes from its own
  // games only — open for picks the moment its slate exists, live once
  // games kick off, final when they're all in the books.
  const roundStatus = (poolId: string): "final" | "live" | "open" => {
    const st = gameStates.get(poolId);
    if (!st) return "open";
    if (st.allFinal) return "final";
    if (st.startedCount > 0) return "live";
    return "open";
  };

  // ---- attach-round control data (creator / group admin only) ------
  const canAttach =
    !creationLockedFor(user) && (season.created_by === user.id || myRole === "admin");
  let unattachedPools: { id: string; name: string; week: number | null }[] = [];
  if (canAttach) {
    const attachedIds = new Set(rounds.map((r) => r.pool_id));
    const { data: groupPools } = await supabase
      .from("pickem_pools")
      .select("id, name, week")
      .eq("group_id", id)
      .eq("variant", "standard")
      .order("created_at", { ascending: true });
    unattachedPools = ((groupPools ?? []) as any[]).filter((p) => !attachedIds.has(p.id));
  }
  const linkedRoundNos = new Set(rounds.map((r) => r.round_no));
  const freeRoundNos = Array.from({ length: season.rounds_total }, (_, i) => i + 1).filter(
    (n) => !linkedRoundNos.has(n)
  );

  const statusChip = (st: "final" | "live" | "open") =>
    st === "final"
      ? "bg-slate-100 text-slate-500"
      : st === "live"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-800";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/groups/${id}`}
          className="text-[13px] text-slate-500 underline-offset-4 hover:underline"
        >
          ← {group?.name ?? "Group"}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2">
          <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">
            {season.name}
          </h1>
          <span className="inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            {focusRoundNo
              ? `Round ${focusRoundNo} of ${season.rounds_total}`
              : `${season.rounds_total} rounds`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-snug text-slate-500">
          One season, {season.rounds_total} rounds. Weekly winners bank 10 points on the
          group board — this page is the race.
        </p>
      </div>

      {/* ---- your season record ------------------------------------ */}
      {/* Dark tile as a plain div, NOT Card: Card's base bg-white wins the
          Tailwind cascade over a bg-slate-900 override, which left this
          card white with white hero text on the first preview. */}
      <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3.5 text-white shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Your season record
        </p>
        {myStanding && myStanding.picksMade > 0 ? (
          <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-1.5">
            <p className="font-display text-4xl font-bold tabular-nums leading-none">
              {myStanding.correct}
              <span className="text-slate-500">–</span>
              {myStanding.missed}
            </p>
            <div className="pb-0.5 text-slate-300">
              <p className="text-xs">
                <span className="font-display text-lg font-semibold leading-none text-white">
                  {myRank ? ordinal(myRank) : "—"}
                </span>{" "}
                of {standings.filter((s) => s.picksMade > 0).length} in the race
              </p>
              <p className="mt-0.5 text-xs">
                {myStanding.weeklyWins} {myStanding.weeklyWins === 1 ? "weekly win" : "weekly wins"}
                {" · "}
                {myStanding.pointsBanked} pts banked
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-slate-300">
            You haven&rsquo;t picked a game yet this season. Your record starts with the
            next round you play.
          </p>
        )}
      </div>

      {/* ---- your pick, focus round --------------------------------- */}
      <div>
        <SeasonSectionTitle>
          Your pick{focusRound ? ` — Round ${focusRound.round_no}` : ""}
        </SeasonSectionTitle>
        {focusRound ? (
          (() => {
            const cell = myStanding?.perRound.get(focusRound.round_no) ?? null;
            const slate = focusState?.slateSize ?? 0;
            const picked = focusState?.myPicksMade ?? cell?.picksMade ?? 0;
            const stillOpen = focusState?.myUnpickedUpcoming ?? 0;
            const poolLocked = new Date(focusRound.pool.lock_at).getTime() <= Date.now();
            return (
              <Link href={`/groups/${id}/pickem/${focusRound.pool_id}`}>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base font-semibold uppercase tracking-wide">
                      {focusRound.pool.name}
                    </p>
                    <span
                      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(roundStatus(focusRound.pool_id))}`}
                    >
                      {roundStatus(focusRound.pool_id)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-600">
                    {focusState?.allFinal ? (
                      <>
                        Round&rsquo;s over — you went{" "}
                        <span className="font-semibold">
                          {cell?.correct ?? 0}–{(cell?.decided ?? 0) - (cell?.correct ?? 0)}
                        </span>
                        . Tap to see how it settled.
                      </>
                    ) : stillOpen > 0 ? (
                      <>
                        <span className="font-semibold text-accent">
                          {picked} of {slate} picked
                        </span>{" "}
                        — {stillOpen} {stillOpen === 1 ? "game is" : "games are"} still
                        open. This round needs you; tap to get them in.
                      </>
                    ) : picked >= slate && slate > 0 ? (
                      <>
                        All <span className="font-semibold">{slate} picks in</span>
                        {poolLocked
                          ? " — and locked. Nothing left to do but watch."
                          : " — tap to change one before it locks."}
                      </>
                    ) : (
                      <>
                        The rest of this round already kicked off — your card is
                        locked at{" "}
                        <span className="font-semibold">
                          {picked} of {slate}
                        </span>
                        . Tap to see the damage.
                      </>
                    )}
                  </p>
                </div>
              </Link>
            );
          })()
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[13px] text-slate-500">
              Round 1 isn&rsquo;t set up yet. When the first pool is linked, your picks
              live here.
            </p>
          </div>
        )}
      </div>

      {/* ---- season standings --------------------------------------- */}
      <div>
        <SeasonSectionTitle>Season standings</SeasonSectionTitle>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Player</span>
            <span className="flex items-baseline gap-3">
              <span>Record</span>
              <span className="w-[7.25rem] text-right">Pts · Wins</span>
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {standings.map((s, i) => (
              <div
                key={s.user_id}
                className={`flex items-center justify-between px-4 py-2 ${s.user_id === user.id ? "bg-slate-50" : ""}`}
              >
                <p className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 font-display text-base font-semibold tabular-nums text-slate-400">
                    {i + 1}
                  </span>
                  <Avatar name={s.display_name} animal={avatars.get(s.user_id)} size={24} />
                  <span className="truncate text-sm font-medium">
                    {s.display_name}
                    {s.user_id === user.id && (
                      <span className="ml-1 text-[11px] text-slate-400">(you)</span>
                    )}
                  </span>
                </p>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span
                    className={`font-display text-lg font-bold tabular-nums leading-none ${i === 0 && s.correct > 0 ? "text-accent" : ""}`}
                  >
                    {s.correct}–{s.missed}
                  </span>
                  <span className="w-[7.25rem] text-right text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-slate-700">{s.pointsBanked} pts</span>
                    {" · "}
                    {s.weeklyWins} {s.weeklyWins === 1 ? "win" : "wins"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- round-by-round history grid ----------------------------- */}
      <div>
        <SeasonSectionTitle>Round by round</SeasonSectionTitle>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Player
                </th>
                {Array.from({ length: season.rounds_total }, (_, i) => i + 1).map((n) => (
                  <th
                    key={n}
                    className={`px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                      linkedRoundNos.has(n) ? "text-slate-500" : "text-slate-300"
                    }`}
                  >
                    R{n}
                  </th>
                ))}
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.user_id} className={i > 0 ? "border-t border-slate-100" : ""}>
                  <td className="max-w-[6.5rem] truncate px-3 py-1.5 text-left text-xs font-medium">
                    {s.display_name}
                  </td>
                  {Array.from({ length: season.rounds_total }, (_, x) => x + 1).map((n) => {
                    const cell = s.perRound.get(n);
                    if (!linkedRoundNos.has(n)) {
                      return (
                        <td key={n} className="px-1 py-1.5 text-xs text-slate-300">
                          ·
                        </td>
                      );
                    }
                    if (!cell) {
                      return (
                        <td key={n} className="px-1 py-1.5 text-xs text-slate-300">
                          –
                        </td>
                      );
                    }
                    return (
                      <td
                        key={n}
                        className={`px-1 py-1.5 font-display text-[13px] font-semibold tabular-nums ${
                          cell.won ? "bg-orange-50 text-accent" : "text-slate-700"
                        }`}
                      >
                        {cell.correct}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-display text-[13px] font-bold tabular-nums">
                    {s.correct}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Highlighted = won the round (10 pts on the group board). – = didn&rsquo;t pick
          that round.
        </p>
      </div>

      {/* ---- rounds list --------------------------------------------- */}
      <div>
        <SeasonSectionTitle>Rounds</SeasonSectionTitle>
        <div className="space-y-1.5">
          {Array.from({ length: season.rounds_total }, (_, i) => i + 1).map((n) => {
            const round = rounds.find((r) => r.round_no === n);
            if (!round) {
              return (
                <div
                  key={n}
                  className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[15px] font-semibold uppercase tracking-wide text-slate-400">
                      Round {n}
                    </p>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Not set up yet
                    </span>
                  </div>
                </div>
              );
            }
            const st = roundStatus(round.pool_id);
            const cell = myStanding?.perRound.get(n) ?? null;
            return (
              <Link key={n} href={`/groups/${id}/pickem/${round.pool_id}`}>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition hover:border-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[15px] font-semibold uppercase tracking-wide">
                      Round {n} — {round.pool.name}
                    </p>
                    <span
                      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(st)}`}
                    >
                      {st}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-slate-600">
                    {cell
                      ? `You: ${cell.correct} correct of ${cell.decided} decided${cell.won ? " — you took this one" : ""}`
                      : st === "final"
                        ? "You sat this one out."
                        : "You haven't picked in this round yet."}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ---- commissioner: attach a round ---------------------------- */}
      {canAttach && unattachedPools.length > 0 && freeRoundNos.length > 0 && (
        <div>
          <SeasonSectionTitle>Commissioner — attach a round</SeasonSectionTitle>
          <div className="rounded-2xl border border-slate-200 px-4 py-3.5">
            <p className="text-[13px] text-slate-600">
              Link one of this group&rsquo;s existing pick&rsquo;em pools as the next
              round. Picks and points stay exactly where they are.
            </p>
            <form action={attachPoolToSeason} className="mt-2.5 flex flex-wrap items-end gap-2">
              <input type="hidden" name="seasonId" value={season.id} />
              <label className="min-w-44 flex-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Pool
                </span>
                <select name="poolId" className={fieldClass} defaultValue={unattachedPools[0].id}>
                  {unattachedPools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.week ? ` (Week ${p.week})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Round
                </span>
                <select name="roundNo" className={fieldClass} defaultValue={freeRoundNos[0]}>
                  {freeRoundNos.map((n) => (
                    <option key={n} value={n}>
                      Round {n}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton>Attach round</SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
