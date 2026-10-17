// ESPN -> games table sync (college football, scoreboard only).
// Free and keyless, same pattern as lib/nfl-sync.ts.
//
// Only games involving at least one AP Top 25 team are flagged
// (competitor.curatedRank.current <= 25; ESPN reports 99 for unranked).
// Standard winner pick'em grades off final scores, which the scoreboard
// already carries, so no boxscore pull is needed. Over/under props for
// CFB would need boxscore parsing — not built yet.

import { createServiceClient } from "./supabase/service";
import { touchSyncState } from "./sync-state";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

export interface CfbSyncResult {
  games_upserted: number;
  top25_upserted: number;
}

type GameStatus = "scheduled" | "in_progress" | "final";

function espnStatus(state: string | undefined): GameStatus {
  if (state === "in") return "in_progress";
  if (state === "post") return "final";
  return "scheduled";
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rankOf(competitor: any): number | null {
  const r = competitor?.curatedRank?.current;
  const n = typeof r === "string" ? parseInt(r, 10) : Number(r);
  if (!Number.isFinite(n) || n > 25) return null; // ESPN reports 99 for unranked
  return n;
}

// "#4 Ohio State" — plain name when unranked.
function rankedName(name: string, rank: number | null): string {
  return rank != null ? `#${rank} ${name}` : name;
}

export async function syncCfb(): Promise<CfbSyncResult> {
  const supabase = createServiceClient();

  const res = await fetch(SCOREBOARD_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN CFB scoreboard fetch failed: ${res.status}`);
  const data = await res.json();

  const season = data.season?.year ?? null;
  const week = data.week?.number ?? null;

  const rows: Record<string, unknown>[] = [];
  let top25_upserted = 0;
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const comps: any[] = comp.competitors ?? [];
    const home = comps.find((c) => c.homeAway === "home");
    const away = comps.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const homeAbbr = String(home.team?.abbreviation ?? "").toUpperCase();
    const awayAbbr = String(away.team?.abbreviation ?? "").toUpperCase();
    const status = espnStatus(comp.status?.type?.state);
    const period = Number(comp.status?.period) || null;
    const clock = typeof comp.status?.displayClock === "string" ? comp.status.displayClock : null;
    const homeRank = rankOf(home);
    const awayRank = rankOf(away);
    const isTop25 = homeRank != null || awayRank != null;
    if (isTop25) top25_upserted++;
    rows.push({
      external_id: String(ev.id),
      sport: "CFB",
      label: `${rankedName(away.team?.name ?? awayAbbr, awayRank)} at ${rankedName(home.team?.name ?? homeAbbr, homeRank)}`,
      home_team: homeAbbr || null,
      away_team: awayAbbr || null,
      home_rank: homeRank,
      away_rank: awayRank,
      period,
      clock,
      starts_at: ev.date ?? null,
      status,
      home_score: num(home.score) || null,
      away_score: num(away.score) || null,
      week,
      season,
      is_top25: isTop25,
    });
  }

  let games_upserted = 0;
  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("games")
      .upsert(rows, { onConflict: "sport,external_id" })
      .select("id");
    if (error) throw new Error(`CFB games upsert failed: ${error.message}`);
    games_upserted = upserted?.length ?? 0;
  }

  await touchSyncState("CFB");
  return { games_upserted, top25_upserted };
}
