import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinSurvivorPool, saveSurvivorPick } from "@/lib/survivor-actions";
import { computeSurvivorState, type SurvivorGame } from "@/lib/survivor";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";

function fmtKickoff(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SurvivorPoolPage({
  params,
}: {
  params: Promise<{ id: string; poolId: string }>;
}) {
  const { id, poolId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pool } = await supabase
    .from("survivor_pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (!pool || pool.group_id !== id) redirect(`/groups/${id}`);

  // Guests (open pools) aren't group members — their way back is the
  // Pools tab, not the group page they can't open.
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", pool.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = Boolean(membership);

  const state = await computeSurvivorState(supabase, pool);
  const now = Date.now();
  const mine = state.entries.find((e) => e.user_id === user.id) ?? null;
  const joinOpen = state.firstKickoff
    ? new Date(state.firstKickoff).getTime() > now
    : false;
  const currentWeek = state.currentWeek;
  const currentGames: SurvivorGame[] =
    currentWeek !== null ? (state.gamesByWeek.get(currentWeek) ?? []) : [];
  const myPick = mine && currentWeek !== null ? mine.picks.get(currentWeek) : undefined;
  const myPickGame = myPick
    ? currentGames.find((g) => g.id === myPick.game_id)
    : undefined;
  const burned = mine
    ? [...mine.picks.entries()]
        .filter(([w]) => currentWeek !== null && w < currentWeek)
        .map(([, c]) => c.team)
    : [];

  // Pick distribution for the current week — only picks whose game has
  // kicked off are public; the rest stay hidden until their kickoff.
  const revealedCounts = new Map<string, number>();
  let picksIn = 0;
  if (currentWeek !== null) {
    for (const e of state.entries) {
      if (!e.alive && e.eliminated_week !== null && e.eliminated_week < currentWeek) continue;
      const cell = e.picks.get(currentWeek);
      if (!cell) continue;
      picksIn += 1;
      if (cell.started) revealedCounts.set(cell.team, (revealedCounts.get(cell.team) ?? 0) + 1);
    }
  }
  const distribution = [...revealedCounts.entries()].sort((a, b) => b[1] - a[1]);

  const join = joinSurvivorPool.bind(null, poolId);
  const savePick = saveSurvivorPick.bind(null, poolId);

  const gridWeeks = state.weeks.filter(
    (w) => state.gradedWeeks.has(w) || w === currentWeek
  );
  const sortedEntries = [...state.entries].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive && !b.alive)
      return (b.eliminated_week ?? 0) - (a.eliminated_week ?? 0);
    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <div className="space-y-6">
      {isMember ? (
        <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
          ← Back to group
        </Link>
      ) : (
        <Link href="/pools" className="text-sm text-slate-500 underline-offset-4 hover:underline">
          ← Back to pools
        </Link>
      )}

      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
          {pool.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Survivor · starts Week {pool.start_week} ·{" "}
          {state.decided
            ? "decided"
            : `${state.aliveCount} of ${state.entries.length} alive${
                currentWeek !== null ? ` · Week ${currentWeek}` : ""
              }`}
        </p>
      </div>

      {state.decided && state.champions.length > 0 && (
        <Card className="border-accent/40 bg-orange-50">
          <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">
            {state.champions.map((c) => c.display_name).join(" & ")}{" "}
            <span className="text-accent">
              {state.champions.length > 1 ? "share the crown" : "takes it"}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-600">Last entry standing. Everyone else is out.</p>
        </Card>
      )}

      {!mine && joinOpen && !state.decided && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              You&rsquo;re not in yet. One pick a week — lose and you&rsquo;re out.
              Entries close {fmtKickoff(state.firstKickoff)} ET.
            </p>
            <form action={join}>
              <SubmitButton>Join</SubmitButton>
            </form>
          </div>
        </Card>
      )}
      {!mine && !joinOpen && !state.decided && state.entries.length > 0 && (
        <Card>
          <p className="text-sm text-slate-500">Entries closed — this one already kicked off.</p>
        </Card>
      )}

      {mine && !mine.alive && (
        <Card>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">You&rsquo;re out</span> — eliminated in
            Week {mine.eliminated_week}. The rest of the board is below.
          </p>
        </Card>
      )}

      {mine && mine.alive && !state.decided && currentWeek !== null && (
        <div>
          <SectionTitle>Your Week {currentWeek} pick</SectionTitle>
          <Card>
            {myPick ? (
              <p className="text-sm">
                You&rsquo;re on{" "}
                <span className="font-semibold text-slate-900">{myPick.team}</span>
                {myPickGame ? (
                  <span className="text-slate-500">
                    {" "}({myPickGame.label}) ·{" "}
                    {myPick.started
                      ? myPick.result === "live"
                        ? "game's live — pick's locked"
                        : "locked"
                      : `locks ${fmtKickoff(myPickGame.starts_at)} ET — tap another team to change it`}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                No pick yet for Week {currentWeek}. Miss the week and you&rsquo;re out.
              </p>
            )}
            {burned.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                Already used: {burned.join(", ")} — no team twice.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {currentGames.map((g) => {
                const started = g.starts_at
                  ? new Date(g.starts_at).getTime() <= now
                  : false;
                const teams = [g.away_team, g.home_team].filter(Boolean) as string[];
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{g.label}</p>
                      <p className="text-xs text-slate-400">
                        {g.status === "final"
                          ? `Final · ${g.away_team} ${g.away_score} – ${g.home_score} ${g.home_team}`
                          : g.status === "in_progress"
                            ? `Live · ${g.away_team} ${g.away_score ?? 0} – ${g.home_score ?? 0} ${g.home_team}`
                            : `${fmtKickoff(g.starts_at)} ET`}
                      </p>
                    </div>
                    <form action={savePick} className="flex shrink-0 gap-1.5">
                      <input type="hidden" name="game_id" value={g.id} />
                      {teams.map((t) => {
                        const used = burned.includes(t);
                        const selected = myPick?.game_id === g.id && myPick?.team === t;
                        return (
                          <button
                            key={t}
                            type="submit"
                            name="picked_team"
                            value={t}
                            disabled={started || used}
                            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                              selected
                                ? "bg-slate-900 text-white"
                                : used
                                  ? "cursor-not-allowed bg-slate-100 text-slate-300 line-through"
                                  : started
                                    ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </form>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {currentWeek !== null && !state.decided && state.entries.length > 0 && (
        <div>
          <SectionTitle>Week {currentWeek} picks</SectionTitle>
          <Card>
            <p className="text-sm text-slate-600">
              {picksIn} of {state.entries.filter((e) => e.alive || e.eliminated_week === currentWeek).length} picks in.
              {distribution.length > 0 ? " Revealed so far:" : " Picks reveal as their games kick off."}
            </p>
            {distribution.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {distribution.map(([team, n]) => (
                  <div key={team} className="flex items-center gap-3">
                    <span className="w-10 text-sm font-semibold text-slate-800">{team}</span>
                    <div
                      className="h-2.5 rounded-full bg-[#c2410c]"
                      style={{ width: `${Math.max(8, (n / Math.max(1, picksIn)) * 100)}%` }}
                    />
                    <span className="text-xs text-slate-500">
                      {n} {n === 1 ? "pick" : "picks"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div>
        <SectionTitle>Standings</SectionTitle>
        {state.entries.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No entries yet — be the first in.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Entry</th>
                  {gridWeeks.map((w) => (
                    <th key={w} className="px-2 py-2.5 text-center font-semibold">
                      W{w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => {
                  const isChamp = state.champions.some((c) => c.entry_id === e.entry_id);
                  return (
                    <tr
                      key={e.entry_id}
                      className={`border-b border-slate-50 last:border-0 ${
                        e.user_id === user.id ? "bg-slate-50" : ""
                      } ${e.alive ? "" : "text-slate-400"}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${e.alive ? "text-slate-900" : ""}`}>
                          {e.display_name}
                        </span>
                        {e.user_id === user.id && (
                          <span className="ml-1 text-xs text-slate-400">(you)</span>
                        )}
                        {isChamp ? (
                          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">
                            champion
                          </span>
                        ) : !e.alive ? (
                          <span className="ml-2 text-xs">out W{e.eliminated_week}</span>
                        ) : null}
                      </td>
                      {gridWeeks.map((w) => {
                        const cell = e.picks.get(w);
                        const isMine = e.user_id === user.id;
                        if (!cell) {
                          return (
                            <td key={w} className="px-2 py-2.5 text-center text-slate-300">
                              {state.gradedWeeks.has(w) && (e.alive || (e.eliminated_week ?? 0) >= w)
                                ? "—"
                                : "·"}
                            </td>
                          );
                        }
                        if (!cell.started && !isMine) {
                          return (
                            <td key={w} className="px-2 py-2.5 text-center text-slate-300">
                              •••
                            </td>
                          );
                        }
                        const cls =
                          cell.result === "win"
                            ? "bg-emerald-50 font-semibold text-emerald-800"
                            : cell.result === "loss"
                              ? "bg-rose-50 font-semibold text-rose-700"
                              : cell.result === "live"
                                ? "bg-amber-50 font-semibold text-amber-800"
                                : "font-medium text-slate-700";
                        return (
                          <td key={w} className={`px-2 py-2.5 text-center ${cls}`}>
                            {cell.team}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Pick one team each week. Win and you advance; lose, tie, or forget to pick and
          you&rsquo;re out. No team twice. A pick locks at its game&rsquo;s kickoff — until
          then, only you can see it.
        </p>
      </div>
    </div>
  );
}
