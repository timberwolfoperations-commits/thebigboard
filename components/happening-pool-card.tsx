"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui";

// Accordion card for a happening-now pool. The header is always visible;
// the per-game rows expand on tap so a dashboard with many pools stays
// scannable. Server passes pre-rendered header/sub nodes plus plain data.

export interface LiveCardGame {
  id: string;
  label: string;
  home_team: string | null;
  away_team: string | null;
  starts_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  period: number | null;
  clock: string | null;
  swing: boolean;
  splitLine: string | null;
}

export interface LiveCardData {
  games: LiveCardGame[];
  picks: Record<string, string>;
  syncedAgo: string | null;
  finalCount: number;
}

function kickoffLabel(iso: string | null): string {
  if (!iso) return "";
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

function GameRow({ g, myPick }: { g: LiveCardGame; myPick?: string }) {
  const away = String(g.away_team ?? "").toUpperCase();
  const home = String(g.home_team ?? "").toUpperCase();
  const hs = g.home_score ?? 0;
  const as = g.away_score ?? 0;
  const decided = g.status === "in_progress" || g.status === "final";
  const leader = decided ? (hs > as ? home : as > hs ? away : null) : null;
  const pickState = !myPick
    ? null
    : g.status === "final"
      ? leader === myPick
        ? "hit"
        : leader
          ? "missed"
          : null
      : g.status === "in_progress"
        ? leader === myPick
          ? "hitting"
          : null
        : "upcoming";
  const teamCls = (t: string) =>
    t !== myPick ? "" : pickState === "missed" ? "font-semibold text-slate-400" : "font-bold text-[#c2410c]";
  return (
    <div className="border-b border-slate-50 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-display text-[15px] font-semibold uppercase tracking-wide">{g.label}</p>
        <span className="flex shrink-0 items-center gap-1.5">
          {g.swing && g.status !== "final" && (
            <span className="rounded-full bg-[#c2410c]/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#c2410c]">
              SWING
            </span>
          )}
          {g.status === "in_progress" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide text-red-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              LIVE{g.period ? ` Q${g.period}` : ""}
              {g.clock ? ` ${g.clock}` : ""}
            </span>
          ) : g.status === "final" ? (
            <span className="text-[11px] font-bold tracking-wide text-slate-400">FINAL</span>
          ) : (
            <span className="text-[11px] font-bold tracking-wide text-slate-400">
              {kickoffLabel(g.starts_at)}
            </span>
          )}
        </span>
      </div>
      <p className="font-display text-2xl font-semibold tracking-wide">
        {g.status === "scheduled" ? (
          <>
            <span className={teamCls(away)}>{away}</span>
            <span className="text-slate-300"> – </span>
            <span className={teamCls(home)}>{home}</span>
          </>
        ) : (
          <>
            <span className={teamCls(away)}>
              {away} {as}
            </span>
            <span className="text-slate-300"> – </span>
            <span className={teamCls(home)}>
              {hs} {home}
            </span>
          </>
        )}
      </p>
      {myPick && (
        <p className="text-xs text-slate-500">
          Your pick:{" "}
          <span
            className={
              pickState === "missed" ? "font-semibold text-slate-400" : "font-bold text-[#c2410c]"
            }
          >
            {myPick}
          </span>
          {pickState === "hitting" && " · hitting"}
          {pickState === "hit" && " · hit"}
          {pickState === "missed" && " · missed"}
          {g.swing && g.splitLine && <span className="text-slate-400"> · {g.splitLine}</span>}
        </p>
      )}
    </div>
  );
}

export default function HappeningPoolCard({
  poolKey,
  header,
  sub,
  live,
}: {
  // Stable per-pool key (e.g. "pickem-<id>") — the collapse choice is
  // remembered in localStorage so it survives reloads and back-nav.
  poolKey: string;
  header: ReactNode;
  sub: ReactNode;
  live: LiveCardData | null;
}) {
  // Cards with games in progress start expanded — that's when the
  // scores matter. Everything else stays collapsed for scannability.
  const liveCount = live ? live.games.filter((g) => g.status === "in_progress").length : 0;
  const [open, setOpen] = useState(liveCount > 0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bb-pool-open:${poolKey}`);
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // Private mode etc. — just fall back to the default.
    }
    setReady(true);
  }, [poolKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(`bb-pool-open:${poolKey}`, open ? "1" : "0");
    } catch {
      // Non-fatal.
    }
  }, [open, ready, poolKey]);
  // Two-tier expansion: live games are always visible when the card is
  // open; upcoming and final games hide behind "show more".
  const liveGames = live ? live.games.filter((g) => g.status === "in_progress") : [];
  const otherGames = live ? live.games.filter((g) => g.status !== "in_progress") : [];
  const [showAll, setShowAll] = useState(false);
  const summary = !live
    ? null
    : liveCount > 0
      ? `${liveCount} live · ${live.finalCount} of ${live.games.length} final`
      : live.finalCount === live.games.length
        ? `${live.games.length} final`
        : `${live.games.length} games`;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">{header}</div>
      <div className="mt-1">{sub}</div>
      {live && live.games.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 flex w-full items-center justify-between border-t border-slate-100 pt-2 text-left"
          >
            <span className="text-sm text-slate-500">{summary}</span>
            <span className="text-sm text-slate-400">{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <div className="pt-1">
              {liveGames.map((g) => (
                <GameRow key={g.id} g={g} myPick={live.picks[g.id]} />
              ))}
              {otherGames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  className="flex w-full items-center justify-between py-2 text-left"
                >
                  <span className="text-sm text-slate-500">
                    {showAll ? "Show fewer games" : `Show ${otherGames.length} more games`}
                  </span>
                  <span className="text-sm text-slate-400">{showAll ? "▴" : "▾"}</span>
                </button>
              )}
              {showAll &&
                otherGames.map((g) => <GameRow key={g.id} g={g} myPick={live.picks[g.id]} />)}
              <p className="pb-1 pt-1 text-center text-[11px] tracking-wide text-slate-400">
                {live.finalCount} of {live.games.length} final
                {live.syncedAgo ? ` · ${live.syncedAgo}` : ""}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
