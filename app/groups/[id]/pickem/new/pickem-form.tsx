"use client";

import { useState } from "react";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";
import type { SlateGame } from "@/lib/slate";
import { STANDARD_HOW_IT_WORKS, OVER_UNDER_HOW_IT_WORKS, ATS_HOW_IT_WORKS, CONFIDENCE_HOW_IT_WORKS, CONFIDENCE_ATS_HOW_IT_WORKS, CONFIDENCE_ATS_CBB_HOW_IT_WORKS } from "@/lib/pickem-copy";

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
// once games start. Confidence pools are the exception: a confidence
// week spans days and each game locks at its own tip-off, so the pool
// lock defaults to the LAST tip-off instead — otherwise the whole week
// would lock at the first game. Editable below either way.
function defaultLock(games: SlateGame[], confidence: boolean): string {
  const checked = games.filter((g) => g.defaultChecked);
  const pool = checked.length > 0 ? checked : games;
  if (pool.length === 0) return "";
  const times = pool.map((g) => g.starts_at).sort();
  return etLocal(confidence ? times[times.length - 1] : times[0]);
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
  cbbGames,
  cbbSyncError,
}: {
  action: (formData: FormData) => Promise<void>;
  nflGames: SlateGame[];
  mlbGames: SlateGame[];
  cfbGames: SlateGame[];
  cbbGames: SlateGame[];
  // Non-null when the CBB fallback sync threw while loading this page:
  // the slate is empty because the feed failed, not because no top
  // games are scheduled. Shown under the slate area (CBB tab only).
  cbbSyncError?: string | null;
}) {
  const [variant, setVariant] = useState("standard");
  const [sport, setSport] = useState<"NFL" | "MLB" | "CFB" | "CBB">("NFL");
  const games =
    sport === "MLB" ? mlbGames : sport === "CFB" ? cfbGames : sport === "CBB" ? cbbGames : nflGames;
  const isOverUnder = variant === "over_under";
  const isConfidence = variant === "confidence";
  const isCollege = sport === "CFB" || sport === "CBB";
  // null = untouched, so the default follows the sport: college pools
  // grade against the spread out of the box, NFL pools straight up.
  // Touching the checkbox makes it the commish's call from then on.
  const [useSpread, setUseSpread] = useState<boolean | null>(null);
  const ats = !isOverUnder && (useSpread ?? isCollege);
  // null = untouched, so the default follows the sport/variant: a
  // confidence week defaults to the last tip-off, everything else to
  // the first kickoff. Typing once makes it the commish's call from
  // then on; switching sports resets it (same as the slate below).
  const [lockAt, setLockAt] = useState<string | null>(null);
  // null = untouched, so the text follows the variant; typing once makes it
  // the commish's own words and variant switches stop touching it.
  const [rules, setRules] = useState<string | null>(null);
  const defaultRules = isOverUnder
    ? OVER_UNDER_HOW_IT_WORKS
    : isConfidence
      ? ats
        ? sport === "CBB"
          ? CONFIDENCE_ATS_CBB_HOW_IT_WORKS
          : CONFIDENCE_ATS_HOW_IT_WORKS
        : CONFIDENCE_HOW_IT_WORKS
      : ats
        ? ATS_HOW_IT_WORKS
        : STANDARD_HOW_IT_WORKS;

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
            <option value="confidence">
              Top 5 Confidence — pick 5 games, rank them 5 to 1
            </option>
            <option value="over_under" disabled={sport === "CFB" || sport === "CBB"}>
              Over/Under — pick sides on player props
            </option>
          </select>
        </Field>

        <Field label="Rules (shown to everyone)">
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            value={rules ?? defaultRules}
            onChange={(e) => setRules(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Sport">
          <select
            value={sport}
            onChange={(e) => {
              const s = e.target.value as "NFL" | "MLB" | "CFB" | "CBB";
              setSport(s);
              setLockAt(null); // new slate, new default lock
              if (s === "CFB") setVariant("standard"); // no CFB boxscores yet, so no props
              if (s === "CBB" && variant === "over_under") setVariant("standard"); // no CBB boxscores either
            }}
            className={inputClass}
          >
            <option value="NFL">NFL</option>
            <option value="MLB">MLB</option>
            <option value="CFB">College football</option>
            <option value="CBB">College basketball</option>
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
            value={lockAt ?? defaultLock(games, isConfidence)}
            onChange={(e) => setLockAt(e.target.value)}
            // No slate, no default to compute: defaultLock returns "" and
            // iOS Safari fills an empty datetime-local with right-now as
            // a placeholder, which looks like a real time while the form
            // refuses to submit. Disabled until games load — and the
            // field is optional now anyway: a blank lock is computed on
            // the server from the selected games (see createPickemPool).
            disabled={games.length === 0}
            className={inputClass}
          />
        </Field>
        <p className="-mt-2 text-xs text-slate-500">
          {games.length === 0
            ? isConfidence
              ? "No games loaded yet — the lock will default to the last tip-off once the slate appears."
              : "No games loaded yet — the lock will default to the first kickoff once the slate appears."
            : isOverUnder
              ? "Defaults to the first kickoff — every prop locks then."
              : isConfidence
                ? "Defaults to the last tip-off — the week stays open game by game. Each game also locks individually at its own kickoff."
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
                  {ats && g.line && (
                    <span className="text-xs font-semibold text-slate-500">{g.line}</span>
                  )}
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
                    : sport === "CBB"
                      ? isConfidence
                        ? "Top games only — ranked teams and big-conference games — all checked by default. Each player picks any 5 and ranks them 5 to 1. Winners fill in automatically from the scores feed."
                        : "Top games only — ranked teams and big-conference games — all checked by default. Uncheck any you don't want. Winners fill in automatically from the scores feed."
                      : "Sunday games are checked by default — uncheck any, or add Thursday/Monday games. Winners fill in automatically from the scores feed."}
            </p>
          </div>
        ) : sport === "CBB" && cbbSyncError ? (
          <p className="text-xs font-medium text-red-600">
            Couldn&rsquo;t load CBB games: {cbbSyncError}. Try reloading — the sync retries every 15 minutes.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            No upcoming {sport} games found yet — the slate appears once ESPN posts it.
          </p>
        )}
        </div>

        {!isOverUnder && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="use_spread"
              checked={useSpread ?? isCollege}
              onChange={(e) => setUseSpread(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#c2410c]"
            />
            <span>
              <span className="font-medium">Against the spread</span>
              <span className="block text-xs text-slate-500">
                {sport === "CBB"
                  ? "Picks are graded against the line, not straight up. Lines follow the live line until each game tips off, then freeze."
                  : "Picks are graded against the line, not straight up. Lines freeze when the pool is created."}
              </span>
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_public"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#c2410c]"
          />
          <span>
            <span className="font-medium">Open pool — anyone signed in can join</span>
            <span className="block text-xs text-slate-500">
              Shows up in everyone&rsquo;s Open pools list. Guests play this pool only —
              they don&rsquo;t join the group.
            </span>
          </span>
        </label>

        <SubmitButton>Create pool</SubmitButton>
      </form>
    </Card>
  );
}
