// ESPN -> games table sync (MLB only). Mirrors lib/nfl-sync.ts exactly:
// same tables, same flow, baseball stat keys. ESPN's site API is free and
// keyless. Server-only: uses the service-role client, bypassing RLS.
//
// Verified 2026-10-14 against a real final (ALCS G2, CLE 1 @ TB 3):
// - boxscore.players[].statistics[].name is null for MLB; dispatch on keys:
//   batting has 'atBats', pitching has 'fullInnings.partInnings'.
// - Batting keys: runs, hits, RBIs, homeRuns, walks (NO doubles/triples/SB
//   in the structured feed). Singles = hits - homeRuns, so doubles/triples
//   score as singles in auto-sync; the commish manual grid is the override.
// - Pitching keys: fullInnings.partInnings ("5.1" style), strikeouts.
//   IP is kept as the decimal ESPN reports, matching manual-entry semantics.
// - W/SV are NOT in the per-pitcher lines. They come from
//   summary.header.competitions[0].status.featuredAthletes
//   (winningPitcher / savingPitcher, finals only).
// - Batting strikeouts are NOT mapped: the formula's K point is for
//   pitching strikeouts only.

import { createServiceClient } from "./supabase/service";
import { touchSyncState } from "./sync-state";

const scoreboardUrl = (dates: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dates}`;
const summaryUrl = (eventId: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`;

export interface MlbSyncResult {
  games_upserted: number;
  stat_lines_upserted: number;
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

// Strip accents so "José Ramírez" matches the "Jose Ramirez" a commish
// pastes into the player list. computePoolPoints matches case-insensitively
// on top of this.
function normName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Fold one game's boxscore into per-player rows keyed for the MLB formula
// (1B, 2B, 3B, HR, R, RBI, SB, BB, K, IP, W, SV). Exported for tests.
export function parseMlbBoxscore(summary: any): {
  player_name: string;
  team: string;
  stats: Record<string, number>;
}[] {
  const byKey = new Map<string, { player_name: string; team: string; stats: Record<string, number> }>();

  const take = (name: string, team: string, patch: Record<string, number>) => {
    const key = `${team}|${name}`;
    let row = byKey.get(key);
    if (!row) {
      row = { player_name: name, team, stats: {} };
      byKey.set(key, row);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) row.stats[k] = (row.stats[k] ?? 0) + v;
    }
  };

  const boxscore = summary?.boxscore;
  for (const side of boxscore?.players ?? []) {
    const team = String(side.team?.abbreviation ?? "").toUpperCase();
    for (const cat of side.statistics ?? []) {
      const keys: string[] = cat.keys ?? [];
      const isPitching = keys.includes("fullInnings.partInnings");
      const isBatting = keys.includes("atBats");
      if (!isPitching && !isBatting) continue;
      for (const a of cat.athletes ?? []) {
        const name = normName(String(a.athlete?.displayName ?? "").trim());
        if (!name) continue;
        const s: (string | number)[] = a.stats ?? [];
        const val = (label: string) => {
          const i = keys.indexOf(label);
          return i < 0 ? 0 : num(s[i]);
        };
        if (isBatting) {
          const hits = val("hits");
          const hr = val("homeRuns");
          take(name, team, {
            // H is total hits (doubles/triples included — the feed can't
            // split them, so every hit scores the same). SB stays 0 unless
            // the commish overrides via the manual grid.
            H: hits,
            HR: hr,
            R: val("runs"),
            RBI: val("RBIs"),
            BB: val("walks"),
          });
        } else {
          take(name, team, {
            K: val("strikeouts"),
            IP: val("fullInnings.partInnings"),
          });
        }
      }
    }
  }

  // Wins and saves live on the game, not the pitching line (finals only).
  const featured: any[] =
    summary?.header?.competitions?.[0]?.status?.featuredAthletes ?? [];
  const credit = (role: string, key: string) => {
    const fa = featured.find((f) => f?.name === role);
    const name = normName(String(fa?.athlete?.fullName ?? "").trim());
    if (!name) return;
    for (const row of byKey.values()) {
      if (row.player_name === name) {
        row.stats[key] = (row.stats[key] ?? 0) + 1;
        return;
      }
    }
  };
  credit("winningPitcher", "W");
  credit("savingPitcher", "SV");

  return [...byKey.values()];
}

function yyyymmdd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

export async function syncMlb(): Promise<MlbSyncResult> {
  const supabase = createServiceClient();

  // Postseason-friendly window: finals from the last 2 days, scheduled
  // games for the next 3. In the regular season this is ~15 games/day.
  const now = new Date();
  const seen = new Map<string, any>();
  for (const offset of [-2, -1, 0, 1, 2, 3]) {
    const d = new Date(now.getTime() + offset * 24 * 3600 * 1000);
    let data: any;
    try {
      const res = await fetch(scoreboardUrl(yyyymmdd(d)), { cache: "no-store" });
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }
    for (const ev of data.events ?? []) {
      if (!seen.has(String(ev.id))) seen.set(String(ev.id), ev);
    }
  }

  const season =
    [...seen.values()].map((ev: any) => ev.season?.year).find((y) => y) ?? null;

  const rows: Record<string, unknown>[] = [];
  const liveIds: string[] = [];
  for (const ev of seen.values()) {
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
    rows.push({
      external_id: String(ev.id),
      sport: "MLB",
      period,
      clock,
      label: `${away.team?.name ?? awayAbbr} at ${home.team?.name ?? homeAbbr}`,
      home_team: homeAbbr || null,
      away_team: awayAbbr || null,
      starts_at: ev.date ?? null,
      status,
      home_score: num(home.score) || null,
      away_score: num(away.score) || null,
      week: null,
      season,
    });
    if (status === "in_progress" || status === "final") liveIds.push(String(ev.id));
  }

  let games_upserted = 0;
  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("games")
      .upsert(rows, { onConflict: "sport,external_id" })
      .select("id");
    if (error) throw new Error(`games upsert failed: ${error.message}`);
    games_upserted = upserted?.length ?? 0;
  }

  const { data: gameRows } = await supabase
    .from("games")
    .select("id, external_id")
    .eq("sport", "MLB")
    .in("external_id", liveIds.length > 0 ? liveIds : ["__none__"]);
  const idByExternal = new Map(((gameRows ?? []) as any[]).map((g) => [g.external_id, g.id]));

  let stat_lines_upserted = 0;
  for (const eventId of liveIds) {
    const gameId = idByExternal.get(eventId);
    if (!gameId) continue;
    let summary: any;
    try {
      const sres = await fetch(summaryUrl(eventId), { cache: "no-store" });
      if (!sres.ok) continue;
      summary = await sres.json();
    } catch {
      continue; // one bad boxscore shouldn't kill the sync
    }
    const lines = parseMlbBoxscore(summary).map((l) => ({
      game_id: gameId,
      player_name: l.player_name,
      team: l.team,
      stats: l.stats,
    }));
    if (lines.length === 0) continue;
    const { error } = await supabase
      .from("game_stat_lines")
      .upsert(lines, { onConflict: "game_id,player_name,team" });
    if (error) continue;
    stat_lines_upserted += lines.length;
  }

  await touchSyncState("MLB");
  return { games_upserted, stat_lines_upserted };
}
