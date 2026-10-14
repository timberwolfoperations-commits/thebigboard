import { enterStatLines } from "@/lib/actions";
import { Card, SubmitButton } from "@/components/ui";

// One per-game stat grid: players down the side, stat columns across the
// top. Used on the pool page and on the commish scoring page — one
// implementation, two places.
export default function PoolStatGrid({
  poolId,
  game,
  saved,
  players,
  statKeys,
  lines,
}: {
  poolId: string;
  game: number;
  saved: boolean;
  players: { id: string; name: string }[];
  statKeys: string[];
  lines: Record<string, Record<string, number>>;
}) {
  const saveStats = enterStatLines.bind(null, poolId);

  return (
    <Card className="p-0 overflow-hidden">
      <form action={saveStats}>
        <input type="hidden" name="game_number" value={game} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium">
                  Game {game}
                  {saved && <span className="font-normal"> · saved</span>}
                </th>
                {statKeys.map((k) => (
                  <th key={k} className="px-2 py-2 text-center font-medium">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
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
                        defaultValue={lines[p.id]?.[k] ?? ""}
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
          <SubmitButton>Save game {game} stats</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
