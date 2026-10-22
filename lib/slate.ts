import { createClient } from "@/lib/supabase/server";

export interface SlateGame {
  id: string;
  label: string;
  starts_at: string;
  week: number | null;
  season: number | null;
  defaultChecked: boolean;
  // Current DraftKings line from the feed, favorite-first ("MIA -19.5",
  // "EVEN" for a pick'em) — null until the book posts one. The creation
  // form shows it next to games in an against-the-spread pool; the pool
  // itself snapshots the number at creation and never re-reads this.
  line: string | null;
}

// games.spread is the HOME team's number (negative = home favored).
// Render the favorite with its line, the way ESPN's details string does.
export function slateLineLabel(
  homeTeam: string | null,
  awayTeam: string | null,
  spread: unknown
): string | null {
  const s = spread == null ? null : Number(spread);
  if (s == null || !Number.isFinite(s)) return null;
  if (s === 0) return "EVEN";
  const fav = s < 0 ? homeTeam : awayTeam;
  if (!fav) return null;
  return `${String(fav).toUpperCase()} -${Math.abs(s)}`;
}

// Upcoming NFL slate for pool-creation checklists: games kicking off in the
// next 8 days. Sunday games come checked by default; Thursday/Monday games
// are listed unchecked so the commish can add them. If the table is empty
// (first run), sync from ESPN once before rendering.
export async function loadSlateGames(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SlateGame[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 3600 * 1000);

  async function read() {
    const { data } = await supabase
      .from("games")
      .select("id, label, starts_at, week, season, home_team, away_team, spread")
      .eq("sport", "NFL")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at", { ascending: true });
    return (data ?? []) as {
      id: string;
      label: string;
      starts_at: string;
      week: number | null;
      season: number | null;
      home_team: string | null;
      away_team: string | null;
      spread: number | null;
    }[];
  }

  let games = await read();
  if (games.length === 0) {
    try {
      const { syncNfl } = await import("@/lib/nfl-sync");
      await syncNfl();
      games = await read();
    } catch {
      // ESPN hiccup — the form still works, just without the checklist.
    }
  }

  return games.map((g) => ({
    id: g.id,
    label: g.label,
    starts_at: g.starts_at,
    week: g.week,
    season: g.season,
    line: slateLineLabel(g.home_team, g.away_team, g.spread),
    defaultChecked:
      new Date(g.starts_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }) === "Sun",
  }));
}

// MLB slate for Showdown pool creation: games from the last 2 days through
// the next 3 (postseason-friendly window). The next upcoming game comes
// checked by default — the commish checks any other games the pool covers.
// Same empty-table fallback as the NFL loader: sync once from ESPN.
export async function loadMlbSlateGames(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SlateGame[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const to = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  async function read() {
    const { data } = await supabase
      .from("games")
      .select("id, label, starts_at, season, home_team, away_team, spread")
      .eq("sport", "MLB")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at", { ascending: true });
    return (data ?? []) as {
      id: string;
      label: string;
      starts_at: string;
      season: number | null;
      home_team: string | null;
      away_team: string | null;
      spread: number | null;
    }[];
  }

  let games = await read();
  if (games.length === 0) {
    try {
      const { syncMlb } = await import("@/lib/mlb-sync");
      await syncMlb();
      games = await read();
    } catch {
      // ESPN hiccup — the form still works, just without the checklist.
    }
  }

  const nextUp = games.find((g) => new Date(g.starts_at).getTime() >= now.getTime());
  return games.map((g) => ({
    id: g.id,
    label: g.label,
    starts_at: g.starts_at,
    week: null,
    season: g.season,
    line: slateLineLabel(g.home_team, g.away_team, g.spread),
    defaultChecked: nextUp != null && g.id === nextUp.id,
  }));
}

// CFB slate for pick'em pool creation: top-25 games (at least one ranked
// team) kicking off in the next 4 days — covers Saturday plus any weekday
// ranked matchups. All come checked by default: the slate IS the top 25.
// Same empty-table fallback as the other loaders: sync once from ESPN.
export async function loadCfbSlateGames(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SlateGame[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 4 * 24 * 3600 * 1000);

  async function read() {
    const { data } = await supabase
      .from("games")
      .select("id, label, starts_at, week, season, home_team, away_team, spread")
      .eq("sport", "CFB")
      .eq("is_top25", true)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at", { ascending: true });
    return (data ?? []) as {
      id: string;
      label: string;
      starts_at: string;
      week: number | null;
      season: number | null;
      home_team: string | null;
      away_team: string | null;
      spread: number | null;
    }[];
  }

  let games = await read();
  if (games.length === 0) {
    try {
      const { syncCfb } = await import("@/lib/cfb-sync");
      await syncCfb();
      games = await read();
    } catch {
      // ESPN hiccup — the form still works, just without the checklist.
    }
  }

  return games.map((g) => ({
    id: g.id,
    label: g.label,
    starts_at: g.starts_at,
    week: g.week,
    season: g.season,
    line: slateLineLabel(g.home_team, g.away_team, g.spread),
    defaultChecked: true,
  }));
}
