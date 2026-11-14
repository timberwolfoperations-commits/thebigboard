// ESPN -> games table sync (men's college basketball, scoreboard +
// per-game odds). Free and keyless, same pattern as lib/cfb-sync.ts.
//
// Two CBB quirks the football syncs don't have:
//
// 1. The scoreboard is DAY-based, not week-based — one fetch per day,
//    today through the next 4 days (the slate window the creation form
//    shows). The `dates` range form doesn't work on this endpoint, so
//    the sync pulls five single-day scoreboards.
// 2. The CBB scoreboard carries NO odds — every game comes back with
//    odds: null, pre/in/post. The lines live on the core API instead:
//    …/events/{id}/competitions/{id}/odds returns DraftKings first,
//    with `spread` as the HOME team's number (same convention as the
//    football scoreboard: negative = home favored — verified live
//    2026-11-13: Duke at home -42.5, Auburn at home +2.5 vs Arizona).
//    Odds are fetched only for scheduled TOP games (ranked or
//    both-power-conference — the only games that can land on a pool
//    slate), in parallel batches of 10, fail-soft per game: a missing
//    line leaves spread null and the next sync retries. And unlike
//    football — where the frozen line is set once at pool creation —
//    the sync refreshes each pool's frozen line from the live line
//    until that game tips off (closing-line behavior, see
//    refreshPoolLines below), so a pool created before a line posts
//    still grades ATS once the line lands. Only a game whose line
//    never posts by tip-off grades straight up.
//
// Rank comes from the scoreboard itself (competitor.curatedRank.current
// <= 25; ESPN reports 99 for unranked — same helper as the CFB sync).
// Conference comes from the static ESPN team-id map in
// lib/cbb-conferences.ts (generated from ESPN's own group resources and
// verified team-by-team); a game is a power-conference game when BOTH
// teams are in a power conference. The games table keeps every CBB
// game (is_top25 / is_power_conf flag the top ones) — the top-games
// filter lives at slate time in lib/slate.ts, not here.

import { createServiceClient } from "./supabase/service";
import { touchSyncState } from "./sync-state";
import { isPowerConferenceGame } from "./cbb-conferences";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const oddsUrl = (eventId: string) =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/${eventId}/competitions/${eventId}/odds`;

// Days of scoreboard to pull: today + the next 4, matching the slate
// window the pool-creation form shows.
const SYNC_DAYS = 5;
// Odds fan-out: parallel batches of 10, each fetch capped so one slow
// ESPN response can't stall the whole sync.
const ODDS_BATCH = 10;
const ODDS_TIMEOUT_MS = 8000;

export interface CbbSyncResult {
  games_upserted: number;
  top_upserted: number;
  odds_filled: number;
  lines_refreshed: number; // frozen pool lines moved to the live line this tick
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

// YYYYMMDD in America/New_York, offset days from today. ESPN's CBB
// calendar day starts 08:00Z (3am ET), so the ET date is the right key.
function etDateString(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

// One game's line from the core API odds endpoint. DraftKings first
// (priority 1 in the payload); anything else only if DraftKings is
// absent. Null spread/over_under when the book hasn't posted or the
// fetch fails — the caller treats that as "no line yet".
async function fetchOdds(
  eventId: string
): Promise<{ spread: number | null; over_under: number | null }> {
  const none = { spread: null, over_under: null };
  try {
    const res = await fetch(oddsUrl(eventId), {
      cache: "no-store",
      signal: AbortSignal.timeout(ODDS_TIMEOUT_MS),
    });
    if (!res.ok) return none;
    const data = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const dk = items.find((i) => i?.provider?.name === "DraftKings") ?? items[0];
    if (!dk) return none;
    const spread = Number(dk.spread);
    const total = Number(dk.overUnder);
    return {
      spread: Number.isFinite(spread) ? spread : null,
      over_under: Number.isFinite(total) ? total : null,
    };
  } catch {
    return none;
  }
}

export async function syncCbb(): Promise<CbbSyncResult> {
  const supabase = createServiceClient();

  // Five single-day scoreboards in parallel — the range form of the
  // dates param errors on this endpoint, so days are fetched one by one.
  const days = Array.from({ length: SYNC_DAYS }, (_, i) => etDateString(i));
  const boards = await Promise.all(
    days.map(async (date) => {
      const url = new URL(SCOREBOARD_URL);
      url.searchParams.set("dates", date);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`ESPN CBB scoreboard fetch failed (${date}): ${res.status}`);
      return res.json();
    })
  );

  const season = boards[0]?.leagues?.[0]?.season?.year ?? boards[0]?.season?.year ?? null;

  type PendingGame = {
    external_id: string;
    home_id: string;
    away_id: string;
    status: GameStatus;
    row: Record<string, unknown>;
  };
  const pending: PendingGame[] = [];
  let top_upserted = 0;
  for (const data of boards) {
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
      const isPowerConf = isPowerConferenceGame(home.team?.id, away.team?.id);
      if (isTop25 || isPowerConf) top_upserted++;
      pending.push({
        external_id: String(ev.id),
        home_id: String(home.team?.id ?? ""),
        away_id: String(away.team?.id ?? ""),
        status,
        row: {
          external_id: String(ev.id),
          sport: "CBB",
          label: `${rankedName(away.team?.name ?? awayAbbr, awayRank)} at ${rankedName(home.team?.name ?? homeAbbr, homeRank)}`,
          home_team: homeAbbr || null,
          away_team: awayAbbr || null,
          home_rank: homeRank,
          away_rank: awayRank,
          period,
          clock,
          starts_at: ev.date ?? null,
          status,
          // A scoreless game that has started is a real 0, not "no score" —
          // only a scheduled game has no score yet. (Same rule as the CFB sync.)
          home_score: status === "scheduled" ? null : num(home.score),
          away_score: status === "scheduled" ? null : num(away.score),
          spread: null,
          over_under: null,
          week: null, // basketball has no week; the pool form's Week field stays blank
          season,
          is_top25: isTop25,
          is_power_conf: isPowerConf,
        },
      });
    }
  }

  // Lines only matter for scheduled top games — the only games a pool
  // can include, and only before they tip (grading reads the line a
  // pool froze, never the live one — but see the closing-line refresh
  // below: for CBB the frozen line follows the live line until tip-off,
  // so a pool created before a line posts still grades ATS once the line
  // lands, and only a game whose line never posts by tip-off grades
  // straight up). In-progress/final games skip the odds fetch entirely.
  const needsOdds = pending.filter(
    (p) => p.status === "scheduled" && (p.row.is_top25 === true || p.row.is_power_conf === true)
  );
  let odds_filled = 0;
  for (let i = 0; i < needsOdds.length; i += ODDS_BATCH) {
    const batch = needsOdds.slice(i, i + ODDS_BATCH);
    const results = await Promise.all(batch.map((p) => fetchOdds(p.external_id)));
    results.forEach((odds, j) => {
      if (odds.spread != null || odds.over_under != null) {
        batch[j].row.spread = odds.spread;
        batch[j].row.over_under = odds.over_under;
        if (odds.spread != null) odds_filled++;
      }
    });
  }

  // A failed odds fetch must never erase a line already stored: any
  // row still sitting on null here falls back to the stored spread /
  // total for that game (and in-progress/final games, which skipped
  // the fetch entirely, keep theirs too).
  const storedById = new Map<string, { spread: number | null; over_under: number | null }>();
  if (pending.length > 0) {
    const { data: stored } = await supabase
      .from("games")
      .select("external_id, spread, over_under")
      .eq("sport", "CBB")
      .in(
        "external_id",
        pending.map((p) => p.external_id)
      );
    for (const s of (stored ?? []) as any[]) {
      storedById.set(String(s.external_id), {
        spread: s.spread == null ? null : Number(s.spread),
        over_under: s.over_under == null ? null : Number(s.over_under),
      });
    }
  }
  for (const p of pending) {
    const stored = storedById.get(p.external_id);
    if (!stored) continue;
    if (p.row.spread == null && stored.spread != null) p.row.spread = stored.spread;
    if (p.row.over_under == null && stored.over_under != null) p.row.over_under = stored.over_under;
  }

  let games_upserted = 0;
  const rows = pending.map((p) => p.row);
  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("games")
      .upsert(rows, { onConflict: "sport,external_id" })
      .select("id");
    if (error) throw new Error(`CBB games upsert failed: ${error.message}`);
    games_upserted = upserted?.length ?? 0;
  }

  // Closing-line refresh: a pool's frozen line follows the live line
  // until its game tips off, then freezes for good. Fail-soft — the
  // games above are already stored; a refresh failure just means the
  // lines wait for the next 15-minute tick.
  let lines_refreshed = 0;
  try {
    lines_refreshed = await refreshPoolLines(
      supabase,
      pending.map((p) => p.external_id)
    );
  } catch (e) {
    console.error("CBB pool-line refresh failed (lines retry next tick):", e);
  }

  await touchSyncState("CBB");
  return { games_upserted, top_upserted, odds_filled, lines_refreshed };
}

// Refresh the frozen ATS line on every pool game linked to a CBB game
// that hasn't tipped yet, from the live line the sync just stored on
// games. Grading is against the LINE AT TIP-OFF, not the line a player
// saw when they picked — the number on the pick button stays live all
// week and locks when the game does. Rules:
//   - A game whose live line is missing keeps its stored snapshot:
//     a failed or not-yet-posted line never overwrites with null.
//   - A tipped game never moves again — the freeze happens naturally
//     at tip-off (status scheduled + starts_at in the future only).
//   - Only CBB-linked rows are reachable here (the lookup starts from
//     CBB games), so other sports' pools are untouched — their lines
//     still freeze once at creation.
// Returns how many frozen snapshots moved.
async function refreshPoolLines(supabase: any, externalIds: string[]): Promise<number> {
  if (externalIds.length === 0) return 0;
  const nowMs = Date.now();
  const { data: games } = await supabase
    .from("games")
    .select("id, spread, starts_at, status")
    .eq("sport", "CBB")
    .in("external_id", externalIds);
  const live = new Map<string, number>();
  for (const g of (games ?? []) as any[]) {
    if (g.status !== "scheduled") continue;
    if (g.starts_at == null || new Date(g.starts_at).getTime() <= nowMs) continue;
    if (g.spread == null) continue;
    live.set(String(g.id), Number(g.spread));
  }
  if (live.size === 0) return 0;
  const { data: links } = await supabase
    .from("pickem_pool_games")
    .select("pool_id, game_id, spread")
    .in("game_id", [...live.keys()]);
  const updates: { pool_id: string; game_id: string; spread: number }[] = [];
  for (const l of (links ?? []) as any[]) {
    const line = live.get(String(l.game_id));
    if (line == null) continue;
    const stored = l.spread == null ? null : Number(l.spread);
    if (stored !== line) updates.push({ pool_id: l.pool_id, game_id: l.game_id, spread: line });
  }
  if (updates.length === 0) return 0;
  const { error } = await supabase
    .from("pickem_pool_games")
    .upsert(updates, { onConflict: "pool_id,game_id" });
  if (error) throw new Error(`pool-line refresh upsert failed: ${error.message}`);
  return updates.length;
}
