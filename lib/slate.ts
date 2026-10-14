import { createClient } from "@/lib/supabase/server";

export interface SlateGame {
  id: string;
  label: string;
  starts_at: string;
  week: number | null;
  season: number | null;
  defaultChecked: boolean;
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
      .select("id, label, starts_at, week, season")
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
    defaultChecked:
      new Date(g.starts_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }) === "Sun",
  }));
}
