"use client";

import { useState } from "react";
import { POOL_PRESETS } from "@/lib/config";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";

function todayAt8pmET(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}T20:00`;
}

function nextSundayAt1pmET(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const d = new Date(et);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // upcoming Sunday; today if Sunday
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T13:00`;
}

const PRESET_LOCKS: Record<string, () => string> = {
  mlb: todayAt8pmET,
  nfl: nextSundayAt1pmET,
};

export default function PoolForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [preset, setPreset] = useState("mlb");
  const [description, setDescription] = useState(POOL_PRESETS.mlb.rules);
  const [budget, setBudget] = useState(String(POOL_PRESETS.mlb.budget));
  const [rosterSize, setRosterSize] = useState(String(POOL_PRESETS.mlb.rosterSize));
  const [lockAt, setLockAt] = useState(todayAt8pmET());
  const [formula, setFormula] = useState(POOL_PRESETS.mlb.formula);

  function applyPreset(key: string) {
    const p = POOL_PRESETS[key];
    setPreset(key);
    setDescription(p.rules);
    setBudget(String(p.budget));
    setRosterSize(String(p.rosterSize));
    setLockAt(PRESET_LOCKS[key]());
    setFormula(p.formula);
  }

  return (
    <Card>
      <SectionTitle>New roster pool</SectionTitle>
      <form action={action} className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Pool type</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(POOL_PRESETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  preset === key
                    ? "border-[#c2410c] bg-[#c2410c] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pick a starting point — everything below stays editable.
          </p>
        </div>

        <Field label="What's the pool?">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Sunday Showdown"
            className={inputClass}
          />
        </Field>

        <Field label="Rules (shown to everyone)">
          <textarea
            name="description"
            rows={7}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Salary cap ($)">
            <input
              name="budget"
              type="number"
              min={1}
              max={10000}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Players per entry">
            <input
              name="roster_size"
              type="number"
              min={1}
              max={20}
              value={rosterSize}
              onChange={(e) => setRosterSize(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Picks lock (Eastern)">
          <input
            name="lock_at"
            type="datetime-local"
            required
            value={lockAt}
            onChange={(e) => setLockAt(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Scoring formula (STAT, points per unit)">
          <textarea
            name="scoring_formula"
            rows={9}
            required
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <p className="text-sm text-slate-500">
          After creating it, paste the player list as lines of <span className="font-mono">Name, TEAM, salary</span>.
          You&rsquo;ll enter per-game points after each game — the app is the ledger, not the referee.
        </p>

        <SubmitButton>Create pool</SubmitButton>
      </form>
    </Card>
  );
}
