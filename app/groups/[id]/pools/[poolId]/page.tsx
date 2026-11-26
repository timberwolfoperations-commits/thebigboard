import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addPoolPlayers,
  addOnePoolPlayer,
  removePoolPlayer,
  deleteEntry,
  updatePool,
  awardPoolWinner,
} from "@/lib/actions";
import { defaultPoolRules, defaultScoringFormula } from "@/lib/config";
import { computeEntryScores, formatPlayerStatLine } from "@/lib/pool-scoring";
import { MODIFIER_SHORTS, type ModifierCode } from "@/lib/modifiers";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import { Card, SectionTitle, Field, inputClass, fieldClass, SubmitButton, DangerButton } from "@/components/ui";
import PoolStatGrid from "@/components/pool-stat-grid";
import PoolEntryPicker from "@/components/pool-entry-picker";

// Local section heading, one notch down from the shared SectionTitle —
// the pool page runs at Poolr density (compact rows, modest type), same
// as the season page, so it carries its own heading rather than
// changing the shared component.
function PoolSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wider text-slate-900">
      {children}
    </h2>
  );
}

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

// The roster pool home: the season page's layout, translated to a single
// contest. The pool is an ACTIVITY view — your points, your lineup, the
// race — in the same order as the season home (hero, your picks, dense
// board, per-game crowns). The group's lifetime board and rating stay on
// the group page, where the permanent scoreboard lives. Everything below
// the homepage sections (how it works, games, commish controls) keeps
// its existing order and behavior.

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

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { data: players } = await supabase
    .from("pool_players")
    .select("id, name, team, salary, game_number")
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
    .select("entry_id, player_id, modifier")
    .in("entry_id", entryList.map((e) => e.id));
  const picksByEntry = new Map<string, any[]>();
  for (const pk of (picks ?? []) as any[]) {
    const arr = picksByEntry.get(pk.entry_id) ?? [];
    const pl = playerById.get(pk.player_id);
    if (pl) arr.push({ ...pl, modifier: pk.modifier ?? null });
    picksByEntry.set(pk.entry_id, arr);
  }

  const myEntry = entryList.find((e) => e.user_id === user.id);
  const myPicks = myEntry ? (picksByEntry.get(myEntry.id) ?? []) : [];
  const locked = new Date(pool.lock_at).getTime() <= Date.now();
  const isCommish = pool.created_by === user.id;

  // Entry standings WITH the modifiers applied — the same totals the
  // award action and the dashboard use. Base points still come from the
  // API stat lines on the pool's linked games when it has any; otherwise
  // from manual stat lines, exactly as before.
  const { entries: scoredEntries, linkedGames, unmatched, hasModifiers, playerScores } = await computeEntryScores(supabase, poolId);
  // Pre-lock, a user sees only their own picks. Other entries' picks and
  // modifier tags are stripped here, server-side, so they are not in the
  // rendered page at all — no one can copy picks before lock. The entry
  // count in the header still shows those entries exist. After lock,
  // everything is revealed (post-lock reveal, the app's existing
  // philosophy). This applies to everyone, including the commissioner.
  const board = scoredEntries.map((e: any) => {
    const picksHidden = !locked && e.userId !== user.id;
    return {
      ...e,
      user_id: e.userId,
      profiles: { display_name: e.displayName },
      picks: picksHidden ? [] : e.picks,
      picksHidden,
      total: e.total,
    };
  });

  const avatars = await getAvatarMap(
    supabase,
    board.map((e: any) => e.user_id)
  );
  const myBoardEntry = board.find((e: any) => e.user_id === user.id);
  const myRank = myBoardEntry ? board.indexOf(myBoardEntry) + 1 : null;
  const leaderTotal = board.length > 0 ? board[0].total : 0;
  // Has anything scored yet — a linked game live or final, or any entry
  // off zero. Drives the hero's honest pre-game line.
  const anyScored =
    board.some((e: any) => e.total !== 0) ||
    linkedGames.some((g) => g.status === "in_progress" || g.status === "final");
  const heroLine =
    myBoardEntry && hasModifiers && myBoardEntry.bonusTotal > 0
      ? `Base ${myBoardEntry.baseTotal} · bonuses +${myBoardEntry.bonusTotal}`
      : myBoardEntry && !anyScored
        ? "No scores yet — points land as the games play."
        : null;

  // Pool state for the your-picks chip, same shape as the season's
  // round status: final once every linked game is in the books, live
  // while any is playing, locked once picks close, open before that.
  const poolStatus: "final" | "live" | "locked" | "open" =
    linkedGames.length > 0 && linkedGames.every((g) => g.status === "final")
      ? "final"
      : linkedGames.some((g) => g.status === "in_progress")
        ? "live"
        : locked
          ? "locked"
          : "open";
  const statusChip = (st: "final" | "live" | "locked" | "open") =>
    st === "final"
      ? "bg-slate-100 text-slate-500"
      : st === "live" || st === "locked"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-800";

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

  // Per-game crowns: for pools whose players carry a game slot, the entry
  // (or entries) with the most points from that game's slot — MODIFIED
  // points, so a doubled pick can win its game's crown. Board only —
  // no lifetime points. A game only crowns once it is live or final and
  // someone has scored in it. Crowns are a post-lock reveal too: they
  // only render once the pool is locked, so no standing leaks before then.
  const hasGameNumbers = playerList.some((p: any) => p.game_number != null);
  const crowns = locked && hasGameNumbers
    ? linkedGames
        .map((g, i) => {
          if (g.status !== "in_progress" && g.status !== "final") return null;
          const scored = board.map((e: any) => ({
            name: e.profiles?.display_name ?? "Player",
            score: e.perGameModified?.[i] ?? 0,
          }));
          const max = Math.max(0, ...scored.map((s) => s.score));
          if (max <= 0) return null;
          return { game: g, winners: scored.filter((s) => s.score === max), points: max };
        })
        .filter(Boolean)
    : [];

  const addPlayers = addPoolPlayers.bind(null, poolId);
  const addPlayer = addOnePoolPlayer.bind(null, poolId);
  const removePlayer = removePoolPlayer.bind(null, poolId);
  const removeEntry = deleteEntry.bind(null, poolId);
  const savePool = updatePool.bind(null, poolId);
  const awardWinner = awardPoolWinner.bind(null, poolId);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/groups/${id}`}
          className="text-[13px] text-slate-500 underline-offset-4 hover:underline"
        >
          ← {group?.name ?? "Group"}
        </Link>
        <h1 className="mt-1.5 font-display text-4xl font-bold uppercase leading-none tracking-wide">
          {pool.name}
        </h1>
        <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
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

      {/* ---- your points hero --------------------------------------- */}
      {/* Dark tile as a plain div, NOT Card: Card's base bg-white wins the
          Tailwind cascade over a bg-slate-900 override, which left this
          card white with white hero text on the first season preview. The
          total is the one billboard element on the page — everything
          below it runs dense; this goes big like Poolr's season home. */}
      <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Your points
        </p>
        {myBoardEntry ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-end gap-x-5 gap-y-1">
              <p className="font-display text-7xl font-bold tabular-nums leading-none">
                {myBoardEntry.total}
              </p>
              <div className="pb-1">
                <p className="font-display text-2xl font-semibold leading-none">
                  Ranked #{myRank ?? "—"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  of {board.length} {board.length === 1 ? "entry" : "entries"}
                </p>
              </div>
            </div>
            {heroLine && <p className="mt-2.5 text-xs text-slate-300">{heroLine}</p>}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-slate-300">
            {playerList.length === 0
              ? "This pool is still being set up — the player list lands here."
              : locked
                ? "Picks locked — you didn't get an entry in."
                : `You haven't entered yet. Pick your ${pool.roster_size} before the lock — your points start here.`}
          </p>
        )}
      </div>

      {/* ---- your picks --------------------------------------------- */}
      {playerList.length > 0 && (
        <div>
          {myEntry ? (
            <>
              <PoolSectionTitle>Your picks</PoolSectionTitle>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-base font-semibold uppercase tracking-wide">
                    Your lineup
                  </p>
                  <span
                    className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusChip(poolStatus)}`}
                  >
                    {poolStatus}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-slate-600">
                  {myPicks
                    .map(
                      (p: any) =>
                        `${p.name}${p.modifier ? ` [${MODIFIER_SHORTS[p.modifier as ModifierCode] ?? p.modifier}]` : ""} ($${p.salary})`
                    )
                    .join(" · ")}
                </p>
                {hasModifiers && myBoardEntry && myBoardEntry.bonusTotal > 0 && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Base {myBoardEntry.baseTotal} · bonuses +{myBoardEntry.bonusTotal}
                  </p>
                )}
                {!locked && (
                  <form action={removeEntry} className="mt-3">
                    <DangerButton>Change my picks</DangerButton>
                  </form>
                )}
              </div>
            </>
          ) : !locked ? (
            <PoolEntryPicker
              poolId={poolId}
              players={playerList}
              budget={pool.budget}
              rosterSize={pool.roster_size}
              modifiersRequired={hasGameNumbers}
              games={linkedGames.map((g, i) => ({ game_number: i + 1, label: g.label, starts_at: g.starts_at }))}
            />
          ) : (
            <>
              <PoolSectionTitle>Your picks</PoolSectionTitle>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                <p className="text-[13px] text-slate-500">
                  Picks locked — you didn&rsquo;t get an entry in.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- leaderboard -------------------------------------------- */}
      {playerList.length > 0 && (
        <div>
          <PoolSectionTitle>Leaderboard</PoolSectionTitle>
          {board.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">No entries yet. Be the first.</p>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span className="min-w-0 flex-1">Plr</span>
                <span className="w-12 text-right">Pts</span>
                <span className="w-8 text-right">GB</span>
              </div>
              <div className="divide-y divide-slate-100">
                {board.map((e: any) => {
                  const gb = leaderTotal - e.total;
                  return (
                    <div
                      key={e.id}
                      className={`px-3 py-1.5 ${e.user_id === user.id ? "bg-orange-50" : ""}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="flex min-w-0 flex-1 items-center gap-1.5">
                          <Avatar
                            name={e.profiles?.display_name ?? "Player"}
                            animal={avatars.get(e.user_id)}
                            size={24}
                          />
                          <span className="min-w-0 truncate text-[13px] font-medium">
                            {e.profiles?.display_name ?? "Player"}
                          </span>
                          {e.user_id === user.id && (
                            <span className="shrink-0 rounded bg-orange-100 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-accent">
                              You
                            </span>
                          )}
                        </p>
                        <span className="w-12 text-right text-[13px] font-semibold tabular-nums">
                          {e.total}
                        </span>
                        <span className="w-8 text-right text-[13px] tabular-nums text-slate-500">
                          {gb === 0 ? "—" : gb}
                        </span>
                      </div>
                      {e.picksHidden ? (
                        <p className="mt-0.5 pl-8 text-xs text-slate-400">
                          Picks hidden until lock.
                        </p>
                      ) : (
                        <p className="mt-0.5 pl-8 text-xs text-slate-600">
                          {e.picks
                            .map(
                              (p: any) =>
                                `${p.name}${p.modifier ? ` [${MODIFIER_SHORTS[p.modifier as ModifierCode] ?? p.modifier}]` : ""} (${p.modified})`
                            )
                            .join(" · ")}
                        </p>
                      )}
                      {hasModifiers && !e.picksHidden && e.bonusTotal > 0 && (
                        <p className="mt-0.5 pl-8 text-[11px] text-slate-400">
                          Base {e.baseTotal} · bonuses +{e.bonusTotal}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- per-game crowns ---------------------------------------- */}
      {crowns.length > 0 && (
        <div>
          <PoolSectionTitle>Per-game crowns</PoolSectionTitle>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {crowns.map((c: any) => (
                <div
                  key={c.game.id}
                  className="flex items-baseline justify-between gap-2 px-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-[13px] font-medium text-slate-700">
                    {c.game.label}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {c.winners.map((w: any) => w.name).join(", ")} · {c.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Most points from that game&rsquo;s slot. Co-winners tie — crowns are
            board-only, no lifetime points.
          </p>
        </div>
      )}

      {/* ---- player scoring --------------------------------------- */}
      {/* Every player in the pool with the base points the formula
          gives them and the raw stats behind it — drafted or not, so
          the whole pool can see who is actually scoring. This is the
          pool's own scoring, not any entry's picks, so it never leaks
          a lineup before lock. Hidden until there is a scoring source
          (linked games or hand-entered lines); before that it would
          just be a column of zeroes. */}
      {playerList.length > 0 && (linkedGames.length > 0 || lineList.length > 0) && (
        <div>
          <PoolSectionTitle>Player scoring</PoolSectionTitle>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="min-w-0 flex-1">Player</span>
              <span className="w-8 text-right">Gm</span>
              <span className="w-12 text-right">Pts</span>
            </div>
            <div className="divide-y divide-slate-100">
              {playerScores.map((p: any) => {
                const line = formatPlayerStatLine(p.stats ?? {});
                return (
                  <div key={p.playerId} className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {p.name}{" "}
                        <span className="font-normal text-slate-400">
                          {p.team} · ${p.salary}
                        </span>
                      </p>
                      <span className="w-8 text-right text-[13px] tabular-nums text-slate-500">
                        {p.gameNumber != null ? `G${p.gameNumber}` : "—"}
                      </span>
                      <span className="w-12 text-right text-[13px] font-semibold tabular-nums">
                        {p.points}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-0 text-xs text-slate-400">
                      {line || "No stats yet"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Base points from the pool&rsquo;s scoring formula. Modifier bonuses
            live on the leaderboard, not here.
          </p>
        </div>
      )}

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
            <Field label="One per line: Name, TEAM, salary, game (1–5, optional)">
              <textarea
                name="players"
                rows={10}
                required
                placeholder={"Shohei Ohtani, LAD, 10, 1\nJacob Misiorowski, MIL, 10, 2\nMookie Betts, LAD, 9, 1"}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <SubmitButton>Save players</SubmitButton>
          </form>
        </Card>
      ) : (
        <>
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
              className={`${fieldClass} w-full sm:w-24`}
            />
            <input
              name="salary"
              placeholder="$"
              type="number"
              min={0}
              required
              className={`${fieldClass} w-full sm:w-24`}
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
