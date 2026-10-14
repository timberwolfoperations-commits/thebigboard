"use client";

import { useState } from "react";
import { Card, SectionTitle, inputClass, SubmitButton } from "@/components/ui";
import { PROP_STATS } from "@/lib/prop-stats";

// Commish-only line editor: rows of player + team + stat + number, add and
// remove freely, one save posts everything as JSON. Saving replaces all
// lines for the pool (and their picks with them) — set them before the
// group starts picking.

export interface PropLineDraft {
  player_name: string;
  team: string;
  stat_key: string;
  line: string;
}

const blankRow = (): PropLineDraft => ({ player_name: "", team: "", stat_key: "HR", line: "" });

export default function PropLinesEditor({
  action,
  existing,
}: {
  action: (formData: FormData) => Promise<void>;
  existing: PropLineDraft[];
}) {
  const [rows, setRows] = useState<PropLineDraft[]>(existing.length > 0 ? existing : [blankRow()]);

  const set = (i: number, patch: Partial<PropLineDraft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, blankRow()]);
  const remove = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const mlb = PROP_STATS.filter((s) => s.sport === "MLB");
  const nfl = PROP_STATS.filter((s) => s.sport === "NFL");

  return (
    <Card>
      <SectionTitle>Set the lines</SectionTitle>
      <form action={action} className="space-y-2">
        <input type="hidden" name="lines" value={JSON.stringify(rows)} />
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.player_name}
              onChange={(e) => set(i, { player_name: e.target.value })}
              placeholder="Player"
              maxLength={60}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <input
              value={r.team}
              onChange={(e) => set(i, { team: e.target.value })}
              placeholder="MIL"
              maxLength={3}
              className={`${inputClass} w-16 shrink-0 uppercase`}
            />
            <select
              value={r.stat_key}
              onChange={(e) => set(i, { stat_key: e.target.value })}
              className={`${inputClass} w-32 shrink-0`}
            >
              <optgroup label="MLB">
                {mlb.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="NFL">
                {nfl.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              value={r.line}
              onChange={(e) => set(i, { line: e.target.value })}
              placeholder="1.5"
              inputMode="decimal"
              className={`${inputClass} w-20 shrink-0`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove line"
              className="shrink-0 rounded-lg px-2 py-2 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={add}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500"
          >
            + Add line
          </button>
          <SubmitButton>Save lines</SubmitButton>
        </div>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Team is the 3-letter abbrev the feed uses (MIL, LAD, BUF…) — it has to
        match or the prop never grades. Saving replaces every line, so set them
        before anyone picks.
      </p>
    </Card>
  );
}
