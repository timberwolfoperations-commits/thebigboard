import { Card } from "@/components/ui";

// One game row with two team buttons — the shared pick UI every pick'em
// variant reuses. Server-rendered: each button is a tiny form, so tapping
// just posts game_id + picked_team. The selected team highlights; after
// kickoff or lock the buttons go dead and the score shows instead.

export interface PickemCardGame {
  id: string;
  label: string;
  home_team: string | null;
  away_team: string | null;
  starts_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

function fmtKickoff(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TeamButton({
  gameId,
  team,
  selected,
  disabled,
  action,
}: {
  gameId: string;
  team: string;
  selected: boolean;
  disabled: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex-1">
      <input type="hidden" name="game_id" value={gameId} />
      <input type="hidden" name="picked_team" value={team} />
      <button
        type="submit"
        disabled={disabled}
        className={`w-full rounded-xl border px-3 py-3 text-sm font-bold transition ${
          selected
            ? "border-[#c2410c] bg-[#c2410c] text-white"
            : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {team}
      </button>
    </form>
  );
}

export default function PickemGameCard({
  game,
  myPick,
  canPick,
  action,
}: {
  game: PickemCardGame;
  myPick: string | null;
  canPick: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const away = String(game.away_team ?? "").toUpperCase();
  const home = String(game.home_team ?? "").toUpperCase();
  const sel = (myPick ?? "").toUpperCase();

  return (
    <Card>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
        {game.label}
      </p>
      <div className="flex items-center gap-2">
        <TeamButton
          gameId={game.id}
          team={away}
          selected={sel === away && away !== ""}
          disabled={!canPick}
          action={action}
        />
        <span className="shrink-0 text-xs font-semibold text-slate-400">@</span>
        <TeamButton
          gameId={game.id}
          team={home}
          selected={sel === home && home !== ""}
          disabled={!canPick}
          action={action}
        />
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        {game.status === "final" ? (
          <span className="font-semibold text-slate-700">
            {away} {game.away_score ?? 0} – {game.home_score ?? 0} {home} · final
          </span>
        ) : game.status === "in_progress" ? (
          <span className="font-semibold text-red-600">
            live: {away} {game.away_score ?? 0} – {game.home_score ?? 0} {home}
          </span>
        ) : (
          <span>
            {fmtKickoff(game.starts_at)} ET
            {myPick && canPick && <span className="text-slate-400"> · tap to change</span>}
            {myPick && !canPick && <span className="text-slate-400"> · locked</span>}
          </span>
        )}
      </p>
    </Card>
  );
}
