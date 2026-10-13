"use client";

import { useState } from "react";
import { submitEntry } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";

export interface PickerPlayer {
  id: string;
  name: string;
  team: string;
  salary: number;
}

export default function PoolEntryPicker({
  poolId,
  players,
  budget,
  rosterSize,
}: {
  poolId: string;
  players: PickerPlayer[];
  budget: number;
  rosterSize: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const spent = players.filter((p) => selected.includes(p.id)).reduce((s, p) => s + p.salary, 0);
  const over = spent > budget;
  const countOk = selected.length === rosterSize;
  const canSubmit = countOk && !over;

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
        <SubmitButton disabled={!canSubmit}>
          {canSubmit ? `Lock in my ${rosterSize}` : "Pick your players"}
        </SubmitButton>
      </form>
    </Card>
  );
}
