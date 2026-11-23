"use client";

import { useState } from "react";
import { submitEntry } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import { MODIFIERS, type ModifierCode } from "@/lib/modifiers";

export interface PickerPlayer {
  id: string;
  name: string;
  team: string;
  salary: number;
  game_number?: number | null;
}

export default function PoolEntryPicker({
  poolId,
  players,
  budget,
  rosterSize,
  modifiersRequired = false,
}: {
  poolId: string;
  players: PickerPlayer[];
  budget: number;
  rosterSize: number;
  modifiersRequired?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mods, setMods] = useState<Record<string, ModifierCode>>({});

  const toggle = (id: string) =>
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
        <div className="max-h-96 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {players.map((p) => {
            const checked = selected.includes(p.id);
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  checked ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="players"
                  value={p.id}
                  checked={checked}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-slate-900"
                />
                <span className="flex-1 font-medium">{p.name}</span>
                {p.game_number != null && (
                  <span className={`text-xs font-semibold ${checked ? "text-slate-300" : "text-slate-400"}`}>
                    G{p.game_number}
                  </span>
                )}
                <span className={`text-xs ${checked ? "text-slate-300" : "text-slate-400"}`}>{p.team}</span>
                <span className={`font-display text-base font-semibold tabular-nums ${checked ? "" : "text-slate-500"}`}>
                  ${p.salary}
                </span>
              </label>
            );
          })}
        </div>
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
                  <span className="flex-1 font-medium">
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
