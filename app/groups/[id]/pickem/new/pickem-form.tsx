"use client";

import { useState } from "react";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";
import type { SlateGame } from "@/lib/slate";
import { STANDARD_HOW_IT_WORKS, OVER_UNDER_HOW_IT_WORKS } from "@/lib/pickem-copy";

function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// UTC iso -> datetime-local value in Eastern.
function etLocal(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Picks default to locking at the first kickoff of the slate — no picks
// once games start. Editable below.
function defaultLock(games: SlateGame[]): string {
  const checked = games.filter((g) => g.defaultChecked);
  const pool = checked.length > 0 ? checked : games;
  if (pool.length === 0) return "";
  const earliest = pool.map((g) => g.starts_at).sort()[0];
  return etLocal(earliest);
}

function defaultWeek(games: SlateGame[]): string {
  const counts = new Map<number, number>();
  for (const g of games.filter((g) => g.defaultChecked)) {
    if (g.week != null) counts.set(g.week, (counts.get(g.week) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [w, n] of counts) {
    if (n > bestN) {
      best = w;
      bestN = n;
    }
  }
  if (best == null) best = games.find((g) => g.week != null)?.week ?? null;
  return best == null ? "" : String(best);
}

function defaultSeason(games: SlateGame[]): string {
  const s = games.find((g) => g.season != null)?.season;
  return s == null ? "" : String(s);
}

export default function PickemForm({
  action,
  nflGames,
  mlbGames,
  cfbGames,
}: {
  action: (formData: FormData) => Promise<void>;
  nflGames: SlateGame[];
  mlbGames: SlateGame[];
  cfbGames: SlateGame[];
}) {
  const [variant, setVariant] = useState("standard");
  const [sport, setSport] = useState<"NFL" | "MLB" | "CFB">("NFL");
  const games = sport === "MLB" ? mlbGames : sport === "CFB" ? cfbGames : nflGames;
  const isOverUnder = variant === "over_under";
  // null = untouched, so the text follows the variant; typing once makes it
  // the commish's own words and variant switches stop touching it.
  const [rules, setRules] = useState<string | null>(null);

  return (
    <Card>
      <SectionTitle>New pick&rsquo;em pool</SectionTitle>
      <form action={action} className="space-y-4">
        <Field label="What's the pool?">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Week 7 Pick'em"
            className={inputClass}
          />
        </Field>

        <Field label="Game type">
          <select
            name="variant"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            className={inputClass}
          >
            <option value="standard">Standard — pick every game&rsquo;s winner</option>
            <option value="over_under" disabled={sport === "CFB"}>
              Over/Under — pick sides on player props
            </option>
          </select>
        </Field>

        <Field label="Rules (shown to everyone)">
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            value={rules ?? (isOverUnder ? OVER_UNDER_HOW_IT_WORKS : STANDARD_HOW_IT_WORKS)}
            onChange={(e) => setRules(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Sport">
          <select
            value={sport}
            onChange={(e) => {
              const s = e.target.value as "NFL" | "MLB" | "CFB";
              setSport(s);
              if (s === "CFB") setVariant("standard"); // no CFB boxscores yet, so no props
            }}
            className={inputClass}
          >
            <option value="NFL">NFL</option>
            <option value="MLB">MLB</option>
            <option value="CFB">College football</option>
          </select>
        </Field>

        {/* key remounts the slate-dependent fields when the sport switches,
            so week/season/lock/games all reset to the new slate's defaults. */}
        <div key={sport} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Week">
            <input name="week" type="number" min={1} max={25} defaultValue={defaultWeek(games)} className={inputClass} />
          </Field>
          <Field label="Season">
            <input name="season" type="number" min={2000} max={2100} defaultValue={defaultSeason(games)} className={inputClass} />
          </Field>
        </div>

        <Field label="Picks lock (Eastern)">
          <input
            name="lock_at"
            type="datetime-local"
            required
            defaultValue={defaultLock(games)}
            className={inputClass}
          />
        </Field>
        <p className="-mt-2 text-xs text-slate-500">
          {isOverUnder
            ? "Defaults to the first kickoff — every prop locks then."
            : "Defaults to the first kickoff. Each game also locks individually at its own kickoff."}
        </p>

        {games.length > 0 ? (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Games in this slate</span>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {games.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="game_ids"
                    value={g.id}
                    defaultChecked={g.defaultChecked}
                    className="h-4 w-4 accent-[#c2410c]"
                  />
                  <span className="font-medium">{g.label}</span>
                  <span className="text-xs text-slate-400">{fmtKickoff(g.starts_at)} ET</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isOverUnder
                ? "Props grade against these games' player stats from the scores feed."
                : sport === "MLB"
                  ? "The next game is checked by default — check any other games the pool covers. Winners fill in automatically from the scores feed."
                  : sport === "CFB"
                    ? "Top-25 games only, all checked by default — uncheck any you don't want. Winners fill in automatically from the scores feed."
                    : "Sunday games are checked by default — uncheck any, or add Thursday/Monday games. Winners fill in automatically from the scores feed."}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            No upcoming {sport} games found yet — the slate appears once ESPN posts it.
          </p>
        )}
        </div>

        <SubmitButton>Create pool</SubmitButton>
      </form>
    </Card>
  );
}
