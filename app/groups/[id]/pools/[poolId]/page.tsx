import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addPoolPlayers, deleteEntry, deletePool, updatePool, enterStatLines, awardPoolWinner } from "@/lib/actions";
import { defaultPoolRules, defaultScoringFormula, calcPoints } from "@/lib/config";
import { Card, SectionTitle, Field, inputClass, SubmitButton, DangerButton } from "@/components/ui";
import PoolEntryPicker from "@/components/pool-entry-picker";

function fmtLock(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// lock_at (UTC) -> datetime-local value in Eastern.
function etInputValue(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function PoolPage({
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

  const { data: pool } = await supabase.from("pools").select("*").eq("id", poolId).single();
  if (!pool) redirect(`/groups/${id}`);

  const { data: players } = await supabase
    .from("pool_players")
    .select("id, name, team, salary")
    .eq("pool_id", poolId)
    .order("salary", { ascending: false });
  const playerList = (players ?? []) as any[];
  const playerById = new Map(playerList.map((p) => [p.id, p]));

  const { data: entries } = await supabase
    .from("pool_entries")
    .select("id, user_id, profiles(display_name)")
    .eq("pool_id", poolId);
  const entryList = (entries ?? []) as any[];

  const { data: picks } = await supabase
    .from("pool_entry_picks")
    .select("entry_id, player_id")
    .in("entry_id", entryList.map((e) => e.id));
  const picksByEntry = new Map<string, any[]>();
  for (const pk of (picks ?? []) as any[]) {
    const arr = picksByEntry.get(pk.entry_id) ?? [];
    const pl = playerById.get(pk.player_id);
    if (pl) arr.push(pl);
    picksByEntry.set(pk.entry_id, arr);
  }

  const myEntry = entryList.find((e) => e.user_id === user.id);
  const myPicks = myEntry ? (picksByEntry.get(myEntry.id) ?? []) : [];
  const locked = new Date(pool.lock_at).getTime() <= Date.now();
  const isCommish = pool.created_by === user.id;

  const { data: statLines } = await supabase
    .from("pool_stat_lines")
    .select("player_id, game_number, stats")
    .eq("pool_id", poolId);
  const lineList = (statLines ?? []) as any[];
  const formula = (pool.scoring_formula ?? {}) as Record<string, number>;
  const statKeys = Object.keys(formula);

  const pointsByPlayer = new Map<string, number>();
  const linesByGame = new Map<number, Map<string, Record<string, number>>>();
  for (const s of lineList) {
    const pts = calcPoints((s.stats ?? {}) as Record<string, number>, formula);
    pointsByPlayer.set(s.player_id, (pointsByPlayer.get(s.player_id) ?? 0) + pts);
    if (!linesByGame.has(s.game_number)) linesByGame.set(s.game_number, new Map());
    linesByGame.get(s.game_number)!.set(s.player_id, (s.stats ?? {}) as Record<string, number>);
  }
  const games = [...linesByGame.keys()].sort((a, b) => a - b);
  const nextGame = games.length > 0 ? games[games.length - 1] + 1 : 1;

  const board = entryList
    .map((e: any) => ({
      ...e,
      picks: picksByEntry.get(e.id) ?? [],
      total: (picksByEntry.get(e.id) ?? []).reduce(
        (sum: number, p: any) => sum + (pointsByPlayer.get(p.id) ?? 0),
        0
      ),
    }))
    .sort((a: any, b: any) => b.total - a.total);

  const addPlayers = addPoolPlayers.bind(null, poolId);
  const removeEntry = deleteEntry.bind(null, poolId);
  const savePool = updatePool.bind(null, poolId);
  const saveStats = enterStatLines.bind(null, poolId);
  const awardWinner = awardPoolWinner.bind(null, poolId);
  const removePool = deletePool.bind(null, poolId);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <div className="text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">{pool.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          ${pool.budget} cap · {pool.roster_size} players · {entryList.length}{" "}
          {entryList.length === 1 ? "entry" : "entries"} ·{" "}
          {locked ? (
            <span className="font-semibold text-red-600">locked</span>
          ) : (
            <span>
              locks <span className="font-semibold">{fmtLock(pool.lock_at)} ET</span>
            </span>
          )}
        </p>
      </div>

      {pool.description && (
        <Card>
          <SectionTitle>How it works</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{pool.description}</p>
        </Card>
      )}

      {isCommish && !locked && entryList.length === 0 && (
        <Card>
          <SectionTitle>Edit pool</SectionTitle>
          <form action={savePool} className="space-y-4">
            <Field label="Name">
              <input name="name" required maxLength={120} defaultValue={pool.name} className={inputClass} />
            </Field>
            <Field label="Rules (shown to everyone)">
              <textarea
                name="description"
                rows={7}
                maxLength={2000}
                defaultValue={pool.description ?? defaultPoolRules(pool.roster_size, pool.budget)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Salary cap ($)">
                <input name="budget" type="number" min={1} max={10000} defaultValue={pool.budget} className={inputClass} />
              </Field>
              <Field label="Players per entry">
                <input name="roster_size" type="number" min={1} max={20} defaultValue={pool.roster_size} className={inputClass} />
              </Field>
            </div>
            <Field label="Scoring formula (STAT, points per unit)">
              <textarea
                name="scoring_formula"
                rows={7}
                required
                defaultValue={Object.entries(formula as Record<string, number>)
                  .map(([k, v]) => `${k}, ${v}`)
                  .join("\n") || defaultScoringFormula()}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Picks lock (Eastern)">
              <input name="lock_at" type="datetime-local" required defaultValue={etInputValue(pool.lock_at)} className={inputClass} />
            </Field>
            <SubmitButton>Save changes</SubmitButton>
          </form>
        </Card>
      )}

      {playerList.length === 0 ? (
        <Card>
          <SectionTitle>Add the player pool</SectionTitle>
          <form action={addPlayers} className="space-y-4">
            <Field label='One per line: Name, TEAM, salary'>
              <textarea
                name="players"
                rows={10}
                required
                placeholder={"Shohei Ohtani, LAD, 10\nJacob Misiorowski, MIL, 10\nMookie Betts, LAD, 9"}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <SubmitButton>Save players</SubmitButton>
          </form>
        </Card>
      ) : (
        <>
          {!locked && !myEntry && (
            <PoolEntryPicker
              poolId={poolId}
              players={playerList}
              budget={pool.budget}
              rosterSize={pool.roster_size}
            />
          )}

          {!locked && myEntry && (
            <Card className="border-green-200 bg-green-50">
              <p className="font-semibold">You&rsquo;re in.</p>
              <p className="mt-1 text-sm text-slate-600">
                {myPicks.map((p: any) => `${p.name} ($${p.salary})`).join(" · ")}
              </p>
              <form action={removeEntry} className="mt-3">
                <DangerButton>Change my picks</DangerButton>
              </form>
            </Card>
          )}

          {locked && !myEntry && (
            <Card>
              <p className="text-sm text-slate-500">Picks locked — you didn&rsquo;t get an entry in.</p>
            </Card>
          )}

          <div>
            <SectionTitle>Leaderboard</SectionTitle>
            {board.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No entries yet. Be the first.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {board.map((e: any, i: number) => (
                  <Card key={e.id} className={e.user_id === user.id ? "border-slate-400" : ""}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        <span className="mr-2 font-display text-lg tabular-nums text-slate-400">{i + 1}</span>
                        {e.profiles?.display_name ?? "Player"}
                        {e.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                      </p>
                      <p className="font-display text-3xl font-bold tabular-nums leading-none">
                        {e.total}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {e.picks
                        .map((p: any) => `${p.name} (${pointsByPlayer.get(p.id) ?? 0})`)
                        .join(" · ")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {isCommish && locked && board.length > 0 && (
            <div>
              {pool.winner_user_id ? (
                <Card>
                  <p className="text-sm">
                    <span className="font-semibold">
                      Winner: {board.find((e: any) => e.user_id === pool.winner_user_id)?.profiles?.display_name ?? "Player"}
                    </span>
                    <span className="text-slate-500"> · +{pool.winner_points} pts on the lifetime board</span>
                  </p>
                </Card>
              ) : (
                <Card>
                  <form action={awardWinner} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      Board&rsquo;s final. Award{" "}
                      <span className="font-semibold text-slate-900">
                        {board[0].profiles?.display_name ?? "Player"}
                      </span>{" "}
                      +10 pts?
                    </p>
                    <SubmitButton>Award winner</SubmitButton>
                  </form>
                </Card>
              )}
            </div>
          )}

          {isCommish && locked && playerList.length > 0 && statKeys.length > 0 && (
            <div>
              <SectionTitle>Enter stats</SectionTitle>
              <div className="space-y-4">
                {[...games, nextGame].map((g) => (
                  <Card key={g} className="p-0 overflow-hidden">
                    <form action={saveStats}>
                      <input type="hidden" name="game_number" value={g} />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium">
                                Game {g}
                                {games.includes(g) && <span className="font-normal"> · saved</span>}
                              </th>
                              {statKeys.map((k) => (
                                <th key={k} className="px-2 py-2 text-center font-medium">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {playerList.map((p: any) => (
                              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                                <td className="sticky left-0 max-w-32 truncate bg-white px-3 py-1.5 font-medium">
                                  {p.name}
                                </td>
                                {statKeys.map((k) => (
                                  <td key={k} className="px-1 py-1 text-center">
                                    <input
                                      name={`stat_${p.id}_${k}`}
                                      type="number"
                                      min={0}
                                      step="any"
                                      placeholder="–"
                                      defaultValue={linesByGame.get(g)?.get(p.id)?.[k] ?? ""}
                                      className="w-14 rounded-lg border border-slate-200 px-1 py-1 text-center text-sm outline-none focus:border-slate-400"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-4">
                        <SubmitButton>Save game {g} stats</SubmitButton>
                      </div>
                    </form>
                  </Card>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Points = stats × the pool&rsquo;s scoring formula. Re-save to correct.
              </p>
            </div>
          )}
        </>
      )}

      {isCommish && (
        <Card>
          <SectionTitle>Danger zone</SectionTitle>
          <form action={removePool}>
            <DangerButton>Delete pool</DangerButton>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            Deletes the pool, its players, entries, and stats for everyone. Awarded points come off the board.
          </p>
        </Card>
      )}
    </div>
  );
}
