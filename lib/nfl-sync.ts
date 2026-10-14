// ESPN -> games table sync (NFL only). ESPN's site API is free and keyless.
// Server-only: uses the service-role client, so it bypasses RLS.
//
// Flow: pull the current week's scoreboard, upsert every game, then pull
// boxscores for games in progress or final and upsert per-player stat lines
// keyed (game_id, player_name, team abbrev). Pool players match on the same
// name + team pair.

import { createServiceClient } from "./supabase/service";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const summaryUrl = (eventId: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;

export interface NflSyncResult {
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

// ESPN boxscore.players: [{ team: {abbreviation}, statistics: [{name, keys,
// athletes: [{athlete: {displayName}, stats: []}]}] }]. Fold each athlete's
// categories into one row with the football formula keys. Exported for tests.
export function parseBoxscore(boxscore: any): {
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

  for (const side of boxscore?.players ?? []) {
    const team = String(side.team?.abbreviation ?? "").toUpperCase();
    for (const cat of side.statistics ?? []) {
      const keys: string[] = cat.keys ?? [];
      for (const a of cat.athletes ?? []) {
        const name = String(a.athlete?.displayName ?? "").trim();
        if (!name) continue;
        const s: (string | number)[] = a.stats ?? [];
        const val = (label: string) => {
          const i = keys.indexOf(label);
          return i < 0 ? 0 : num(s[i]);
        };
        // Real ESPN key names (verbose, e.g. "passingYards" — not "YDS").
        if (cat.name === "passing") {
          take(name, team, {
            pass_yd: val("passingYards"),
            pass_td: val("passingTouchdowns"),
            int: val("interceptions"),
          });
        } else if (cat.name === "rushing") {
          take(name, team, { rush_yd: val("rushingYards"), rush_td: val("rushingTouchdowns") });
        } else if (cat.name === "receiving") {
          take(name, team, {
            rec: val("receptions"),
            rec_yd: val("receivingYards"),
            rec_td: val("receivingTouchdowns"),
          });
        } else if (cat.name === "fumbles") {
          take(name, team, { fum_lost: val("fumblesLost") });
        }
      }
    }
  }
  return [...byKey.values()];
}

export async function syncNfl(): Promise<NflSyncResult> {
  const supabase = createServiceClient();

  const res = await fetch(SCOREBOARD_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status}`);
  const data = await res.json();

  const season = data.season?.year ?? null;
  const week = data.week?.number ?? null;

  const rows: Record<string, unknown>[] = [];
  const liveIds: string[] = [];
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
    rows.push({
      external_id: String(ev.id),
      sport: "NFL",
      label: `${away.team?.name ?? awayAbbr} at ${home.team?.name ?? homeAbbr}`,
      home_team: homeAbbr || null,
      away_team: awayAbbr || null,
      starts_at: ev.date ?? null,
      status,
      home_score: num(home.score) || null,
      away_score: num(away.score) || null,
      week,
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
    .eq("sport", "NFL")
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
    const lines = parseBoxscore(summary.boxscore).map((l) => ({
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

  return { games_upserted, stat_lines_upserted };
}
