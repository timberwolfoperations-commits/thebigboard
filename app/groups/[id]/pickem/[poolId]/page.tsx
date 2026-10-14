import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { savePickemPick, awardPickemWinner } from "@/lib/pickem-actions";
import { computePickemLeaderboard } from "@/lib/pickem-scoring";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import PickemGameCard from "@/components/pickem-game-card";

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

  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("game_id")
    .eq("pool_id", poolId);
  const gameIds = ((links ?? []) as any[]).map((l) => l.game_id);

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

  const locked = new Date(pool.lock_at).getTime() <= Date.now();
  const isCommish = pool.created_by === user.id;
  const allFinal = gameList.length > 0 && gameList.every((g: any) => g.status === "final");

  const board = await computePickemLeaderboard(supabase, poolId);

  const savePick = savePickemPick.bind(null, poolId);
  const awardWinner = awardPickemWinner.bind(null, poolId);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <div className="text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">{pool.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {pool.week ? `Week ${pool.week} · ` : ""}pick&rsquo;em ·{" "}
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

      <div>
        <SectionTitle>Make your picks</SectionTitle>
        <div className="space-y-3">
          {gameList.map((g: any) => (
            <PickemGameCard
              key={g.id}
              game={g}
              myPick={myPickByGame.get(g.id) ?? null}
              canPick={!locked && new Date(g.starts_at).getTime() > Date.now()}
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
                  <p className="font-semibold">
                    <span className="mr-2 font-display text-lg tabular-nums text-slate-400">{i + 1}</span>
                    {r.display_name}
                    {r.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
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

      {isCommish && locked && gameList.length > 0 && (
        <div>
          {pool.winner_user_id ? (
            <Card>
              <p className="text-sm">
                <span className="font-semibold">
                  Winner: {board.find((r) => r.user_id === pool.winner_user_id)?.display_name ?? "Player"}
                </span>
                <span className="text-slate-500"> · +{pool.winner_points} pts on the lifetime board</span>
              </p>
            </Card>
          ) : (
            allFinal &&
            board.length > 0 && (
              <Card>
                <form action={awardWinner} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Every game&rsquo;s final. Award{" "}
                    <span className="font-semibold text-slate-900">{board[0].display_name}</span>{" "}
                    +10 pts?
                  </p>
                  <SubmitButton>Award winner</SubmitButton>
                </form>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
