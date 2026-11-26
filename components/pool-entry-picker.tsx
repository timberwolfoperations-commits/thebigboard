"use client";

import { useState } from "react";
import { submitEntry } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import { MODIFIERS, type ModifierCode } from "@/lib/modifiers";
import { maxPicksPerGame } from "@/lib/config";

export interface PickerPlayer {
  id: string;
  name: string;
  team: string;
  salary: number;
  game_number?: number | null;
}

export interface PickerGame {
  game_number: number;
  label: string;
  starts_at: string | null;
}

function fmtGameShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PoolEntryPicker({
  poolId,
  players,
  budget,
  rosterSize,
  modifiersRequired = false,
  games = [],
}: {
  poolId: string;
  players: PickerPlayer[];
  budget: number;
  rosterSize: number;
  modifiersRequired?: boolean;
  games?: PickerGame[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mods, setMods] = useState<Record<string, ModifierCode>>({});

  const hasGameNumbers = players.some((p) => p.game_number != null);

  // Per-game pick cap — the same rule the server enforces in
  // submitEntry (maxPicksPerGame in lib/config): at most one pick per
  // game when the pool has at least as many games as roster spots,
  // more when a shorter slate has to fit the roster (e.g. 5 picks
  // across 4 games caps at 2 per game). A game's remaining players
  // grey out only once that game has hit the cap.
  const distinctGames = new Set(
    players.map((p) => p.game_number).filter((g) => g != null)
  ).size;
  const maxPerGame = maxPicksPerGame(rosterSize, distinctGames);
  const picksPerGame = new Map<number, number>();
  for (const p of players) {
    if (p.game_number != null && selected.includes(p.id)) {
      picksPerGame.set(p.game_number, (picksPerGame.get(p.game_number) ?? 0) + 1);
    }
  }
  const fullGames = new Set(
    [...picksPerGame.entries()].filter(([, n]) => n >= maxPerGame).map(([g]) => g)
  );

  const isDisabled = (p: PickerPlayer) =>
    !selected.includes(p.id) && p.game_number != null && fullGames.has(p.game_number);

  const toggle = (p: PickerPlayer) => {
    if (isDisabled(p)) return;
    const id = p.id;
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      if (!next.includes(id)) {
        setMods((m) => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
      }
      return next;
    });
  };

  const spent = players.filter((p) => selected.includes(p.id)).reduce((s, p) => s + p.salary, 0);
  const over = spent > budget;
  const countOk = selected.length === rosterSize;
  // Showdown-style pools: all five modifiers, one per pick, each used once.
  const modsAssigned = selected.filter((id) => mods[id]).length;
  const modsDistinct = new Set(selected.map((id) => mods[id]).filter(Boolean)).size;
  const modsOk =
    !modifiersRequired ||
    (selected.length === MODIFIERS.length &&
      modsAssigned === MODIFIERS.length &&
      modsDistinct === MODIFIERS.length);
  const canSubmit = countOk && !over && modsOk;

  // Selected players in game order, so the modifier rows read G1–G5.
  const selectedPlayers = players
    .filter((p) => selected.includes(p.id))
    .sort((a, b) => (a.game_number ?? 99) - (b.game_number ?? 99) || a.name.localeCompare(b.name));

  // Players grouped by game slot (kickoff order G1–G5); players without
  // a slot go in one ungrouped section (legacy pools).
  const gameByNumber = new Map(games.map((g) => [g.game_number, g]));
  const groups: { key: string; title: string; sub?: string; players: PickerPlayer[] }[] = [];
  if (hasGameNumbers) {
    const numbers = [...new Set(players.map((p) => p.game_number).filter((g) => g != null))].sort(
      (a, b) => (a as number) - (b as number)
    );
    for (const n of numbers) {
      const g = gameByNumber.get(n as number);
      groups.push({
        key: `g${n}`,
        title: g ? `G${n} · ${g.label}` : `Game ${n}`,
        sub: g?.starts_at ? `${fmtGameShort(g.starts_at)} ET` : undefined,
        players: players.filter((p) => p.game_number === n),
      });
    }
    const ungrouped = players.filter((p) => p.game_number == null);
    if (ungrouped.length > 0) groups.push({ key: "ungrouped", title: "Players", players: ungrouped });
  } else {
    groups.push({ key: "all", title: "Players", players });
  }

  const submit = submitEntry.bind(null, poolId);

  return (
    <Card>
      <SectionTitle>Your entry</SectionTitle>
      <form action={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          Pick exactly {rosterSize} —{" "}
          <span className={`font-semibold ${over ? "text-red-600" : ""}`}>
            ${spent} / ${budget}
          </span>
          {over && <span className="text-red-600"> over the cap</span>}
        </p>
        {hasGameNumbers && (
          <p className="text-xs text-slate-500">
            {maxPerGame === 1
              ? "One pick per game — picking a player greys out the rest of his game."
              : `At most ${maxPerGame} picks per game — a game greys out once you've picked ${maxPerGame} from it.`}
          </p>
        )}
        <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </span>
                {group.sub && <span className="shrink-0 text-xs text-slate-400">{group.sub}</span>}
              </div>
              <div className="space-y-1">
                {group.players.map((p) => {
                  const checked = selected.includes(p.id);
                  const disabled = isDisabled(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(p)}
                      aria-pressed={checked}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        checked
                          ? "border-slate-900 bg-slate-900 text-white"
                          : disabled
                            ? "cursor-not-allowed border-slate-200 bg-white text-slate-400 opacity-50"
                            : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className={`shrink-0 text-xs ${checked ? "text-slate-300" : "text-slate-400"}`}>
                        {p.team}
                      </span>
                      <span
                        className={`shrink-0 font-display text-base font-semibold tabular-nums ${checked ? "" : "text-slate-500"}`}
                      >
                        ${p.salary}
                      </span>
                      {checked && (
                        <span className="shrink-0 text-sm font-bold" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* Hidden inputs carry the selected ids — the server action reads
            formData.getAll("players"), exactly as the checkboxes did. */}
        {selected.map((id) => (
          <input key={id} type="hidden" name="players" value={id} />
        ))}
        {over ? (
          <p className="text-sm font-medium text-red-600">
            ${spent - budget} over the cap — swap out a player.
          </p>
        ) : (
          !countOk && (
            <p className="text-sm text-slate-500">
              {selected.length < rosterSize
                ? `Pick ${rosterSize - selected.length} more.`
                : `Too many — drop ${selected.length - rosterSize}.`}
            </p>
          )
        )}

        {modifiersRequired && selectedPlayers.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold">Modifiers — one per pick</p>
            {selectedPlayers.map((p) => {
              const takenByOther = new Set(
                selectedPlayers.filter((q) => q.id !== p.id).map((q) => mods[q.id]).filter(Boolean)
              );
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                    {p.game_number != null && <span className="ml-1 text-xs text-slate-400">G{p.game_number}</span>}
                  </span>
                  <select
                    name={`mod_${p.id}`}
                    value={mods[p.id] ?? ""}
                    onChange={(e) =>
                      setMods((m) => ({ ...m, [p.id]: e.target.value as ModifierCode }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>
                      Pick one
                    </option>
                    {MODIFIERS.map((mod) => (
                      <option key={mod.code} value={mod.code} disabled={takenByOther.has(mod.code)}>
                        {mod.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <p className="text-xs text-slate-500">
              {modsOk
                ? "All five assigned — one per pick."
                : `${MODIFIERS.length - modsDistinct} to go — each modifier can be used once.`}
            </p>
            <ul className="space-y-0.5 text-xs text-slate-500">
              {MODIFIERS.map((mod) => (
                <li key={mod.code}>
                  <span className="font-semibold text-slate-600">{mod.label}:</span> {mod.hint}
                </li>
              ))}
            </ul>
          </div>
        )}

        <SubmitButton disabled={!canSubmit}>
          {canSubmit ? `Lock in my ${rosterSize}` : "Pick your players"}
        </SubmitButton>
      </form>
    </Card>
  );
}
