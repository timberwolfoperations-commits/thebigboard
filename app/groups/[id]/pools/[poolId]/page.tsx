import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addPoolPlayers, addOnePoolPlayer, removePoolPlayer, deleteEntry, updatePool, awardPoolWinner } from "@/lib/actions";
import { defaultPoolRules, defaultScoringFormula } from "@/lib/config";
import { computePoolPoints } from "@/lib/pool-scoring";
import { Card, SectionTitle, Field, inputClass, SubmitButton, DangerButton } from "@/components/ui";
import PoolStatGrid from "@/components/pool-stat-grid";
import PoolEntryPicker from "@/components/pool-entry-picker";

function fmtLock(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtGame(iso: string | null): string {
  if (!iso) return "";
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

  // Points come from the API stat lines on the pool's linked games when it
  // has any; otherwise from manual stat lines, exactly as before.
  const { points: pointsByPlayer, unmatched, linkedGames } = await computePoolPoints(supabase, poolId);

  const { data: statLines } = await supabase
    .from("pool_stat_lines")
    .select("player_id, game_number, stats")
    .eq("pool_id", poolId);
  const lineList = (statLines ?? []) as any[];
  const formula = (pool.scoring_formula ?? {}) as Record<string, number>;
  const statKeys = Object.keys(formula);

  const linesByGame = new Map<number, Map<string, Record<string, number>>>();
  for (const s of lineList) {
    if (!linesByGame.has(s.game_number)) linesByGame.set(s.game_number, new Map());
    linesByGame.get(s.game_number)!.set(s.player_id, (s.stats ?? {}) as Record<string, number>);
  }
  const manualGames = [...linesByGame.keys()].sort((a, b) => a - b);
  // For linked pools the manual grids map 1:1 onto linked games by kickoff
  // order, so a hand-entered row overrides that game's API line.
  const gridGames =
    linkedGames.length > 0
      ? linkedGames.map((_, i) => i + 1)
      : [...manualGames, (manualGames.length > 0 ? manualGames[manualGames.length - 1] + 1 : 1)];

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
  const addPlayer = addOnePoolPlayer.bind(null, poolId);
  const removePlayer = removePoolPlayer.bind(null, poolId);
  const removeEntry = deleteEntry.bind(null, poolId);
  const savePool = updatePool.bind(null, poolId);
  const awardWinner = awardPoolWinner.bind(null, poolId);

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

      {linkedGames.length > 0 && (
        <Card>
          <SectionTitle>Games in this pool</SectionTitle>
          <ul className="space-y-1 text-sm">
            {linkedGames.map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-700">{g.label}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {g.status === "final"
                    ? `${g.away_score ?? 0}–${g.home_score ?? 0} · final`
                    : g.status === "in_progress"
                      ? `${g.away_score ?? 0}–${g.home_score ?? 0} · live`
                      : `${fmtGame(g.starts_at)} ET`}
                </span>
              </li>
            ))}
          </ul>
          {unmatched.length > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              No stats found yet for: {unmatched.join(", ")}
            </p>
          )}
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
              {linkedGames.length > 0 && (
                <p className="mb-3 text-xs text-slate-500">
                  Stats auto-fill from the linked games below. Hand-enter a row to
                  override a player for that game (Game N = the Nth game listed).
                </p>
              )}
              <div className="space-y-4">
                {gridGames.map((g) => (
                  <PoolStatGrid
                    key={g}
                    poolId={poolId}
                    game={g}
                    saved={manualGames.includes(g)}
                    players={playerList}
                    statKeys={statKeys}
                    lines={Object.fromEntries(linesByGame.get(g) ?? [])}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Points = stats × the pool&rsquo;s scoring formula. Re-save to correct.
              </p>
            </div>
          )}
        </>
      )}

      {isCommish && !locked && playerList.length > 0 && (
        <Card>
          <SectionTitle>Manage players</SectionTitle>
          <form action={addPlayer} className="flex flex-col gap-2 sm:flex-row">
            <input name="name" placeholder="Name" required maxLength={80} className={inputClass} />
            <input
              name="team"
              placeholder="TEAM"
              required
              maxLength={10}
              className={`${inputClass} sm:w-24`}
            />
            <input
              name="salary"
              placeholder="$"
              type="number"
              min={0}
              required
              className={`${inputClass} sm:w-24`}
            />
            <SubmitButton>Add player</SubmitButton>
          </form>
          <ul className="mt-3 divide-y divide-slate-100">
            {playerList.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-slate-400">
                    {p.team} · ${p.salary}
                  </span>
                </span>
                <form action={removePlayer}>
                  <input type="hidden" name="player_id" value={p.id} />
                  <DangerButton>Remove</DangerButton>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            A player someone already picked can&rsquo;t be removed.
          </p>
        </Card>
      )}
    </div>
  );
}
