"use client";

import { useOptimistic } from "react";
import { Card } from "@/components/ui";

// One game row with two team buttons — the shared pick UI every pick'em
// variant reuses. The tapped team highlights instantly (useOptimistic) while
// the server write happens in the background, so there's no waiting on the
// round-trip to see your pick. After kickoff or lock the buttons go dead
// and the score shows instead.
//
// Confidence mode (Top 5 pools): the same two buttons pick a team, and
// the card grows a 5-to-1 rank row under them. Tapping a team assigns
// the highest free rank automatically (5 first); tapping a rank moves
// it. Ranks used on your other games are dead. A picked card also gets
// a small remove button, so a full 5-pick card can swap a game out.
// The server re-checks all of it (rank uniqueness, the 5-pick cap) —
// the client just keeps the taps honest.

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

// One side's number, from the HOME team's spread (negative = home
// favored): the home team wears the spread as-is, the away team wears
// its mirror — so each pick button carries its own line, sportsbook
// style. "+7" for a dog, "-3.5" for a favorite, "PK" for a pick'em.
export function teamLine(isHome: boolean, spread: number | null): string | null {
  if (spread == null || !Number.isFinite(spread)) return null;
  const n = isHome ? spread : -spread;
  if (n === 0) return "PK";
  return `${n > 0 ? "+" : "-"}${Math.abs(n)}`;
}

function TeamButton({
  gameId,
  team,
  line,
  selected,
  disabled,
  action,
}: {
  gameId: string;
  team: string;
  line?: string | null;
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
        className={`flex w-full flex-col items-center rounded-xl border px-3 py-3 text-sm font-bold leading-tight transition ${
          selected
            ? "border-[#c2410c] bg-[#c2410c] text-white"
            : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span>{team}</span>
        {line && <span className="mt-0.5 text-[11px] font-semibold opacity-80">{line}</span>}
      </button>
    </form>
  );
}

export default function PickemGameCard({
  game,
  myPick,
  canPick,
  reveal,
  spread,
  action,
  confidenceMode,
  myRank,
  usedRanks,
  onRank,
  onClear,
}: {
  game: PickemCardGame;
  myPick: string | null;
  canPick: boolean;
  // Everyone's picks per team, shown once the game has kicked off or the
  // pool has locked (null = keep secret).
  reveal: { team: string; names: string[] }[] | null;
  // Frozen against-the-spread line (home team's number) for ATS pools;
  // null/omitted = straight-up pool, no line shown.
  spread?: number | null;
  action: (formData: FormData) => Promise<void>;
  // Confidence (Top 5) extras. myRank is this game's rank (null =
  // unpicked); usedRanks are the ranks on the player's OTHER games.
  confidenceMode?: boolean;
  myRank?: number | null;
  usedRanks?: number[];
  onRank?: (formData: FormData) => Promise<void>;
  onClear?: (formData: FormData) => Promise<void>;
}) {
  const [optimisticPick, setOptimisticPick] = useOptimistic<string | null, string>(
    myPick,
    (_current, next) => next
  );
  const [optimisticRank, setOptimisticRank] = useOptimistic<number | null, number | null>(
    myRank ?? null,
    (_current, next) => next
  );

  // Highlight the tapped team immediately; the server write runs behind it.
  // In confidence mode a fresh pick gets the highest free rank (5 first);
  // switching teams on a game that already has a rank keeps that rank,
  // exactly like the server does.
  async function pick(formData: FormData) {
    const team = String(formData.get("picked_team") ?? "");
    setOptimisticPick(team);
    if (confidenceMode && onRank) {
      if (optimisticRank == null) {
        const free = [5, 4, 3, 2, 1].find((r) => !(usedRanks ?? []).includes(r));
        if (free != null) setOptimisticRank(free);
      }
      await onRank(formData);
    } else {
      await action(formData);
    }
  }

  async function rank(formData: FormData) {
    const r = Number(formData.get("confidence") ?? "");
    if (Number.isFinite(r)) setOptimisticRank(r);
    if (onRank) await onRank(formData);
  }

  async function clear(formData: FormData) {
    setOptimisticPick("");
    setOptimisticRank(null);
    if (onClear) await onClear(formData);
  }

  const away = String(game.away_team ?? "").toUpperCase();
  const home = String(game.home_team ?? "").toUpperCase();
  const sel = (optimisticPick ?? "").toUpperCase();
  const awayLine = teamLine(false, spread ?? null);
  const homeLine = teamLine(true, spread ?? null);
  const rankSel = optimisticRank ?? null;

  return (
    <Card>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
        {game.label}
      </p>
      <div className="flex items-center gap-2">
        <TeamButton
          gameId={game.id}
          team={away}
          line={awayLine}
          selected={sel === away && away !== ""}
          disabled={!canPick}
          action={pick}
        />
        <span className="shrink-0 text-xs font-semibold text-slate-400">@</span>
        <TeamButton
          gameId={game.id}
          team={home}
          line={homeLine}
          selected={sel === home && home !== ""}
          disabled={!canPick}
          action={pick}
        />
      </div>
      {confidenceMode && sel && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Rank
          </span>
          {[5, 4, 3, 2, 1].map((r) => {
            const takenElsewhere = (usedRanks ?? []).includes(r) && rankSel !== r;
            return (
              <form key={r} action={rank}>
                <input type="hidden" name="game_id" value={game.id} />
                <input type="hidden" name="picked_team" value={sel} />
                <input type="hidden" name="confidence" value={r} />
                <button
                  type="submit"
                  disabled={!canPick || takenElsewhere}
                  className={`h-8 w-8 rounded-full text-sm font-bold transition ${
                    rankSel === r
                      ? "bg-[#c2410c] text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {r}
                </button>
              </form>
            );
          })}
          {canPick && onClear && (
            <form action={clear} className="ml-1">
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </form>
          )}
        </div>
      )}
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
            {optimisticPick && canPick && <span className="text-slate-400"> · tap to change</span>}
            {optimisticPick && !canPick && <span className="text-slate-400"> · locked</span>}
          </span>
        )}
      </p>
      {reveal && reveal.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {reveal.map((r) => (
            <p key={r.team} className="py-0.5 text-center text-xs text-slate-500">
              <span className="font-bold text-slate-900">{r.team}</span>
              {" — "}
              {r.names.join(", ")}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
