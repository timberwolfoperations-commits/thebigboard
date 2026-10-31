import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { savePickemPick, savePropPick, setPickemLines, awardPickemWinner, scratchPickemPool, getRecentPropPlayers, getCopyableLinePools } from "@/lib/pickem-actions";
import { computePickemLeaderboard } from "@/lib/pickem-scoring";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import { PROP_STAT_LABELS } from "@/lib/prop-stats";
import { STANDARD_HOW_IT_WORKS, OVER_UNDER_HOW_IT_WORKS, ATS_HOW_IT_WORKS } from "@/lib/pickem-copy";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import PickemGameCard from "@/components/pickem-game-card";
import PropCard from "@/components/prop-card";
import PropLinesEditor, { type PropLineDraft } from "@/components/prop-lines-editor";
import PoolSwitcher from "@/components/pool-switcher";
import RememberContext from "@/components/remember-context";
import { loadMyGroups, loadMyPools } from "@/lib/my-pools";
import { getGroupLifetime } from "@/lib/lifetime";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtLock(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PickemPoolPage({
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

  const { data: pool } = await supabase.from("pickem_pools").select("*").eq("id", poolId).single();
  if (!pool) redirect(`/groups/${id}`);

  // Guests (open pools) aren't group members — their way back is the
  // Pools tab, not the group page they can't open.
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", pool.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = Boolean(membership);

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id, spread")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);
  // Frozen lines for against-the-spread pools (snapshotted at creation).
  const spreadByGame = new Map<string, number | null>(
    ((links ?? []) as any[]).map((l) => {
      const s = l.spread == null ? null : Number(l.spread);
      return [l.game_id, Number.isFinite(s as number) ? (s as number) : null] as [
        string,
        number | null,
      ];
    })
  );

  const { data: games } = gameIds.length
    ? await supabase
        .from("games")
        .select("id, label, home_team, away_team, starts_at, status, home_score, away_score")
        .in("id", gameIds)
        .order("starts_at", { ascending: true })
    : { data: [] };
  const gameList = ((games ?? []) as any[]);

  const { data: myPicks } = await supabase
    .from("pickem_picks")
    .select("game_id, picked_team")
    .eq("pool_id", poolId)
    .eq("user_id", user.id);
  const myPickByGame = new Map(((myPicks ?? []) as any[]).map((p) => [p.game_id, p.picked_team]));


  const nowMs = Date.now();
  const locked = new Date(pool.lock_at).getTime() <= nowMs;
  const isOverUnder = pool.variant === "over_under";

  // Per-game reveal for standard pick'em: a game's picks go public once
  // THAT game kicks off — nobody can pick or change it anymore — even
  // while the pool itself is still open for later games. Pool lock still
  // reveals everything. Over/under props stay pool-lock-only by design.
  const gameStarted = (g: any) =>
    g.starts_at != null && new Date(g.starts_at).getTime() <= nowMs;
  const anyStarted = !isOverUnder && gameList.some(gameStarted);

  // Everyone's picks, revealed per the rule above — the trash-talk view.
  // Kept secret until a game starts so nobody can copy a live pick.
  // Ordered away-team first to match the button layout.
  const revealByGame = new Map<string, { team: string; names: string[] }[]>();
  if ((locked || anyStarted) && gameList.length > 0) {
    const { data: allPicks } = await supabase
      .from("pickem_picks")
      .select("game_id, picked_team, profiles(display_name)")
      .eq("pool_id", poolId);
    const byGame = new Map<string, Map<string, string[]>>();
    for (const p of (allPicks ?? []) as any[]) {
      const team = String(p.picked_team ?? "").toUpperCase();
      const name = p.profiles?.display_name ?? "Player";
      if (!byGame.has(p.game_id)) byGame.set(p.game_id, new Map());
      const m = byGame.get(p.game_id)!;
      if (!m.has(team)) m.set(team, []);
      m.get(team)!.push(name);
    }
    for (const g of gameList) {
      const m = byGame.get(g.id);
      if (!m) continue;
      const away = String(g.away_team ?? "").toUpperCase();
      const home = String(g.home_team ?? "").toUpperCase();
      const ordered = [away, home]
        .filter((t, i, a) => t !== "" && a.indexOf(t) === i)
        .map((t) => ({ team: t, names: (m.get(t) ?? []).slice().sort() }))
        .filter((r) => r.names.length > 0);
      for (const [t, names] of m) {
        if (t !== away && t !== home) ordered.push({ team: t, names: names.slice().sort() });
      }
      revealByGame.set(g.id, ordered);
    }
  }
  const isCommish = pool.created_by === user.id;
  const useSpread = !isOverUnder && Boolean(pool.use_spread);
  const allFinal = gameList.length > 0 && gameList.every((g: any) => g.status === "final");

  const { data: propLines } = isOverUnder
    ? await supabase
        .from("pickem_lines")
        .select("id, player_name, team, stat_key, line")
        .eq("pool_id", poolId)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const propLineList = (propLines ?? []) as any[];

  // Live actuals for the over/under tracker: sum each line's stat across the
  // pool's linked games from the latest synced data. Includes in-progress
  // games, so the number moves as the commish taps Refresh scores — grading
  // itself still waits for every game to be final.
  const normName = (s: unknown) => String(s ?? "").trim().toUpperCase();
  const liveActualByLine = new Map<string, number>();
  if (isOverUnder && gameIds.length > 0 && propLineList.length > 0) {
    const { data: statLines } = await supabase
      .from("game_stat_lines")
      .select("player_name, team, stats")
      .in("game_id", gameIds);
    const totals = new Map<string, number>();
    for (const sl of (statLines ?? []) as any[]) {
      const stats = (sl.stats ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(stats)) {
        const key = `${normName(sl.player_name)}|${normName(sl.team)}|${k}`;
        totals.set(key, (totals.get(key) ?? 0) + Number(v || 0));
      }
    }
    for (const l of propLineList) {
      const key = `${normName(l.player_name)}|${normName(l.team)}|${l.stat_key}`;
      if (totals.has(key)) liveActualByLine.set(l.id, totals.get(key)!);
    }
  }
  const anyLive = gameList.some((g: any) => g.status === "in_progress");

  const { data: myPropPicks } = isOverUnder
    ? await supabase
        .from("pickem_prop_picks")
        .select("line_id, side")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
    : { data: [] as any[] };
  const mySideByLine = new Map(
    ((myPropPicks ?? []) as any[]).map((p) => [p.line_id, p.side])
  );

  const board = await computePickemLeaderboard(supabase, poolId);
  const avatars = await getAvatarMap(supabase, board.map((r) => r.user_id));

  const { data: winnerRows } = await supabase
    .from("pickem_pool_winners")
    .select("user_id")
    .eq("pool_id", poolId);
  const winnerIds = new Set(((winnerRows ?? []) as any[]).map((w) => w.user_id));
  const winnerNames = board.filter((r) => winnerIds.has(r.user_id)).map((r) => r.display_name);
  const leaderNames =
    board.length > 0
      ? board.filter((r) => r.points === board[0].points).map((r) => r.display_name)
      : [];

  const savePick = savePickemPick.bind(null, poolId);
  const saveProp = savePropPick.bind(null, poolId);
  const setLines = setPickemLines.bind(null, poolId);
  const awardWinner = awardPickemWinner.bind(null, poolId);
  const scratchPool = scratchPickemPool.bind(null, poolId);

  const existingDrafts: PropLineDraft[] = propLineList.map((l) => ({
    player_name: l.player_name,
    team: l.team ?? "",
    stat_key: l.stat_key,
    line: String(l.line),
  }));

  // Recent participants for the lines editor's player picker — only fetched
  // when the editor actually renders (commish, pre-lock).
  const recentPlayers =
    isOverUnder && isCommish && !locked ? await getRecentPropPlayers(poolId) : [];

  // Other over/under pools this commish created, as copy sources for the
  // lines editor — same render condition.
  const copySources =
    isOverUnder && isCommish && !locked ? await getCopyableLinePools(poolId) : [];

  const howItWorks = (() => {
    const saved = (pool.description ?? "").trim();
    // Blank → variant default. Also repairs pools saved with the standard
    // default while on over/under (the old form's defaultValue bug) — a
    // commish who deliberately typed that text into an over/under pool is
    // not a case worth preserving the wrong copy for. Same repair for
    // against-the-spread pools: the untouched standard default would tell
    // players to pick winners in a pool that grades covers.
    if (!saved) return isOverUnder ? OVER_UNDER_HOW_IT_WORKS : useSpread ? ATS_HOW_IT_WORKS : STANDARD_HOW_IT_WORKS;
    if (isOverUnder && saved === STANDARD_HOW_IT_WORKS) return OVER_UNDER_HOW_IT_WORKS;
    if (useSpread && saved === STANDARD_HOW_IT_WORKS) return ATS_HOW_IT_WORKS;
    return pool.description;
  })();

  // Detail-first header (2026-10-30): the switcher replaces the back
  // links and the title — the pool's name is the header, the rest of
  // your pools are one tap away, and the group shows up as one quiet
  // all-time line instead of a hallway you walk back through.
  const myPools = await loadMyPools(supabase, user.id);
  const myGroups = await loadMyGroups(supabase, user.id);
  let allTime: { rank: number; total: number; points: number; groupName: string } | null = null;
  if (isMember) {
    const lifetime = await getGroupLifetime(supabase, id);
    const { data: memberRows } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", id);
    const standings = ((memberRows ?? []) as any[])
      .map((m) => ({ user_id: m.user_id as string, points: lifetime.get(m.user_id)?.points ?? 0 }))
      .sort((a, b) => b.points - a.points);
    const idx = standings.findIndex((s) => s.user_id === user.id);
    if (idx >= 0) {
      allTime = {
        rank: idx + 1,
        total: standings.length,
        points: standings[idx].points,
        groupName: myGroups.find((g) => g.id === id)?.name ?? "the group",
      };
    }
  }

  return (
    <div className="space-y-6">
      <RememberContext poolHref={`/groups/${id}/pickem/${poolId}`} groupId={id} />
      <div>
        <PoolSwitcher
          pools={myPools}
          groups={myGroups}
          currentKey={`pickem:${poolId}`}
          currentName={pool.name}
          currentGroupName={myGroups.find((g) => g.id === id)?.name}
        />
        <p className="mt-1 text-sm text-slate-500">
          {pool.week ? `Week ${pool.week} · ` : ""}
          {useSpread
            ? "Against the spread · lines set when the pool was created"
            : isOverUnder
              ? "over/under"
              : "pick'em"}{" "}
          ·{" "}
          {locked ? (
            <span className="font-semibold text-red-600">locked</span>
          ) : (
            <span>
              locks <span className="font-semibold">{fmtLock(pool.lock_at)} ET</span>
            </span>
          )}
        </p>
        {allTime && (
          <p className="mt-2 text-sm text-slate-500">
            All-time in {allTime.groupName} —{" "}
            <span className="font-semibold text-slate-700">
              {ordinal(allTime.rank)} of {allTime.total}
            </span>{" "}
            · {allTime.points} pts ·{" "}
            <Link href={`/groups/${id}`} className="underline underline-offset-4 hover:text-slate-700">
              Full board
            </Link>
          </p>
        )}
      </div>

      <div>
        <SectionTitle>Leaderboard</SectionTitle>
        {board.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No picks yet. Be the first.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {board.map((r, i) => (
              <Card key={r.user_id} className={r.user_id === user.id ? "border-slate-400" : ""}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2.5 font-semibold">
                    <span className="font-display text-lg tabular-nums text-slate-400">{i + 1}</span>
                    <Avatar name={r.display_name} animal={avatars.get(r.user_id)} size={30} />
                    <span>
                      {r.display_name}
                      {r.user_id === user.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
                    </span>
                  </p>
                  <p className="font-display text-3xl font-bold tabular-nums leading-none">
                    {r.points}
                    <span className="ml-1 align-middle text-xs font-normal text-slate-400">
                      {r.correct}/{r.total_decided}
                    </span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <SectionTitle>How it works</SectionTitle>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{howItWorks}</p>
      </Card>

      {isOverUnder ? (
        <div>
          <SectionTitle>Make your picks</SectionTitle>
          {isCommish && !locked && (
            <div className="mb-4">
              <PropLinesEditor action={setLines} existing={existingDrafts} recentPlayers={recentPlayers} copySources={copySources} />
            </div>
          )}
          {propLineList.length > 0 ? (
            <div className="space-y-3">
              {propLineList.map((l: any) => (
                <PropCard
                  key={l.id}
                  line={{
                    id: l.id,
                    player_name: l.player_name,
                    team: l.team,
                    stat_label: PROP_STAT_LABELS[l.stat_key] ?? l.stat_key,
                    stat_key: l.stat_key,
                    line: l.line,
                  }}
                  mySide={mySideByLine.get(l.id) ?? null}
                  canPick={!locked}
                  current={liveActualByLine.get(l.id) ?? null}
                  live={anyLive}
                  action={saveProp}
                />
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">
                {isCommish
                  ? "Set the lines above to open the board."
                  : "The commish hasn't set the lines yet — check back soon."}
              </p>
            </Card>
          )}
          {!locked && propLineList.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Tap over or under on each prop — tap the other side to change your
              mind. Everything locks at {fmtLock(pool.lock_at)} ET.
            </p>
          )}
        </div>
      ) : (
        <div>
          <SectionTitle>Make your picks</SectionTitle>
          <div className="space-y-3">
            {gameList.map((g: any) => (
              <PickemGameCard
                key={g.id}
                game={g}
                myPick={myPickByGame.get(g.id) ?? null}
                canPick={!locked && new Date(g.starts_at).getTime() > Date.now()}
                reveal={locked || gameStarted(g) ? revealByGame.get(g.id) ?? [] : null}
                spread={useSpread ? (spreadByGame.get(g.id) ?? null) : null}
                action={savePick}
              />
            ))}
          </div>
          {!locked && (
            <p className="mt-2 text-xs text-slate-400">
              Tap a team to pick — tap the other to change your mind. Each game locks at its own kickoff.
            </p>
          )}
        </div>
      )}

      {isCommish && locked && gameList.length > 0 && (
        <div>
          {pool.winner_user_id || winnerNames.length > 0 ? (
            <Card>
              <p className="text-sm">
                <span className="font-semibold">
                  {winnerNames.length > 1 ? "Co-winners: " : "Winner: "}
                  {winnerNames.length > 0
                    ? winnerNames.join(", ")
                    : (board.find((r) => r.user_id === pool.winner_user_id)?.display_name ?? "Player")}
                </span>
                <span className="text-slate-500">
                  {" "}· +{pool.winner_points} pts{winnerNames.length > 1 ? " each" : ""} on the lifetime board
                </span>
              </p>
            </Card>
          ) : pool.scratched ? (
            <Card>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">Scratched</span> — nobody wins, no points.
              </p>
            </Card>
          ) : (
            allFinal &&
            board.length > 0 && (
              <Card>
                <form action={awardWinner} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Every game&rsquo;s final. Award{" "}
                    <span className="font-semibold text-slate-900">{leaderNames.join(", ")}</span>{" "}
                    +10 pts{leaderNames.length > 1 ? " each" : ""}?
                  </p>
                  <SubmitButton>Award {leaderNames.length > 1 ? "winners" : "winner"}</SubmitButton>
                </form>
                <form action={scratchPool} className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">Or scratch it — nobody wins, no points.</p>
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Scratch pool
                  </button>
                </form>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
