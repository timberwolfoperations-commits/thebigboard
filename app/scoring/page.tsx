import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PoolStatGrid from "@/components/pool-stat-grid";
import { Card, SectionTitle } from "@/components/ui";

// Commish scoring: every pool you created that has locked but has no winner
// yet, with its stat grids inline. One stop instead of opening each pool.
export default async function ScoringPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pools } = await supabase
    .from("pools")
    .select("id, name, lock_at, winner_user_id, scoring_formula, group_id, groups ( name )")
    .eq("created_by", user.id)
    .order("lock_at", { ascending: false });

  const now = Date.now();
  const needScores = ((pools ?? []) as any[]).filter(
    (p) => new Date(p.lock_at).getTime() <= now && !p.winner_user_id
  );
  const poolIds = needScores.map((p) => p.id);

  const { data: players } = poolIds.length
    ? await supabase.from("pool_players").select("id, name, pool_id").in("pool_id", poolIds).order("name")
    : { data: [] as any[] };
  const { data: lines } = poolIds.length
    ? await supabase
        .from("pool_stat_lines")
        .select("pool_id, player_id, game_number, stats")
        .in("pool_id", poolIds)
    : { data: [] as any[] };

  const playersByPool = new Map<string, { id: string; name: string }[]>();
  for (const pl of (players ?? []) as any[]) {
    if (!playersByPool.has(pl.pool_id)) playersByPool.set(pl.pool_id, []);
    playersByPool.get(pl.pool_id)!.push({ id: pl.id, name: pl.name });
  }
  const linesByPool = new Map<string, Map<number, Map<string, Record<string, number>>>>();
  for (const s of (lines ?? []) as any[]) {
    if (!linesByPool.has(s.pool_id)) linesByPool.set(s.pool_id, new Map());
    const byGame = linesByPool.get(s.pool_id)!;
    if (!byGame.has(s.game_number)) byGame.set(s.game_number, new Map());
    byGame.get(s.game_number)!.set(s.player_id, (s.stats ?? {}) as Record<string, number>);
  }

  return (
    <div className="space-y-6">
      <SectionTitle>Scoring</SectionTitle>

      {needScores.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            Nothing needs scores. Pools you create show up here once they lock.
          </p>
        </Card>
      )}

      {needScores.map((pool: any) => {
        const statKeys = Object.keys((pool.scoring_formula ?? {}) as Record<string, number>);
        const byGame = linesByPool.get(pool.id) ?? new Map();
        const games = [...byGame.keys()].sort((a, b) => a - b);
        const nextGame = games.length > 0 ? games[games.length - 1] + 1 : 1;
        const groupName = Array.isArray(pool.groups) ? pool.groups[0]?.name : pool.groups?.name;

        return (
          <div key={pool.id} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold uppercase tracking-wide">
                  {pool.name}
                </h3>
                {groupName && <p className="text-xs text-slate-500">{groupName}</p>}
              </div>
              <Link
                href={`/groups/${pool.group_id}/pools/${pool.id}`}
                className="text-sm text-slate-500 underline-offset-4 hover:underline"
              >
                Open pool →
              </Link>
            </div>
            {statKeys.length === 0 || (playersByPool.get(pool.id) ?? []).length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No players or scoring formula yet.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {[...games, nextGame].map((g) => (
                  <PoolStatGrid
                    key={g}
                    poolId={pool.id}
                    game={g}
                    saved={games.includes(g)}
                    players={playersByPool.get(pool.id) ?? []}
                    statKeys={statKeys}
                    lines={Object.fromEntries(byGame.get(g) ?? [])}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs text-slate-400">
        Points = stats × each pool&rsquo;s scoring formula. Re-save to correct.
      </p>
    </div>
  );
}
