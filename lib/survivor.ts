// Survivor state, derived from the games table at read time — the same
// compute-on-read pattern as pick'em scoring, so there is no grading job
// and no stored elimination state to go stale.
//
// Rules (v1):
// - One entry per person. Pick one team per week, starting at start_week.
// - Your team wins -> you advance. Loses or ties -> you're out.
// - No pick in a week that finishes -> you're out.
// - A team can be picked once per entry, ever.
// - A pick locks at its game's kickoff; before kickoff it's hidden from
//   everyone else (the pool page enforces the reveal).

export interface SurvivorGame {
  id: string;
  week: number;
  label: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string; // scheduled | in_progress | final
  starts_at: string | null;
}

export type PickResult = "win" | "loss" | "live" | "pending";

export interface SurvivorPickCell {
  week: number;
  game_id: string;
  team: string;
  result: PickResult;
  started: boolean; // kickoff passed -> revealed to the whole group
}

export interface SurvivorEntryState {
  entry_id: string;
  user_id: string;
  display_name: string;
  alive: boolean;
  eliminated_week: number | null;
  picks: Map<number, SurvivorPickCell>;
  usedBeforeCurrent: string[]; // teams burned in weeks before currentWeek
}

export interface SurvivorPoolRow {
  id: string;
  group_id: string;
  name: string;
  season: number;
  start_week: number;
  created_by: string;
}

export interface SurvivorState {
  gamesByWeek: Map<number, SurvivorGame[]>;
  weeks: number[];
  gradedWeeks: Set<number>;
  currentWeek: number | null; // earliest week with a non-final game
  firstKickoff: string | null; // first game of start_week; joins close here
  entries: SurvivorEntryState[];
  aliveCount: number;
  decided: boolean;
  champions: SurvivorEntryState[];
}

function gameWinner(g: SurvivorGame): string | null {
  if (g.status !== "final" || g.home_score == null || g.away_score == null) return null;
  if (g.home_score > g.away_score) return g.home_team;
  if (g.away_score > g.home_score) return g.away_team;
  return null; // tie game: nobody wins it, a pick on either side loses
}

export async function computeSurvivorState(
  supabase: any,
  pool: SurvivorPoolRow
): Promise<SurvivorState> {
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, week, label, home_team, away_team, home_score, away_score, status, starts_at")
    .eq("sport", "NFL")
    .eq("season", pool.season)
    .gte("week", pool.start_week)
    .order("starts_at", { ascending: true });

  const games = (gameRows ?? []) as SurvivorGame[];
  const gamesByWeek = new Map<number, SurvivorGame[]>();
  const gameById = new Map<string, SurvivorGame>();
  for (const g of games) {
    gameById.set(g.id, g);
    const arr = gamesByWeek.get(g.week) ?? [];
    arr.push(g);
    gamesByWeek.set(g.week, arr);
  }
  const weeks = [...gamesByWeek.keys()].sort((a, b) => a - b);

  const gradedWeeks = new Set<number>();
  for (const w of weeks) {
    const list = gamesByWeek.get(w) ?? [];
    if (list.length > 0 && list.every((g) => g.status === "final")) gradedWeeks.add(w);
  }
  const currentWeek = weeks.find((w) => !gradedWeeks.has(w)) ?? null;
  const startGames = gamesByWeek.get(pool.start_week) ?? [];
  const firstKickoff = startGames.length > 0 ? startGames[0].starts_at : null;
  const now = Date.now();

  const { data: entryRows } = await supabase
    .from("survivor_entries")
    .select("id, user_id, created_at, profiles(display_name)")
    .eq("pool_id", pool.id)
    .order("created_at", { ascending: true });
  const entryList = (entryRows ?? []) as any[];
  const entryIds = entryList.map((e) => e.id);

  const { data: pickRows } = entryIds.length
    ? await supabase
        .from("survivor_picks")
        .select("entry_id, week, game_id, picked_team")
        .in("entry_id", entryIds)
    : { data: [] as any[] };
  const picksByEntry = new Map<string, Map<number, { game_id: string; team: string }>>();
  for (const p of (pickRows ?? []) as any[]) {
    const m = picksByEntry.get(p.entry_id) ?? new Map();
    m.set(p.week, { game_id: p.game_id, team: p.picked_team });
    picksByEntry.set(p.entry_id, m);
  }

  const entries: SurvivorEntryState[] = entryList.map((e) => {
    const raw = picksByEntry.get(e.id) ?? new Map<number, { game_id: string; team: string }>();
    const picks = new Map<number, SurvivorPickCell>();
    let eliminated: number | null = null;

    for (const w of weeks) {
      const pk = raw.get(w);
      if (eliminated !== null) break;
      if (gradedWeeks.has(w)) {
        if (!pk) {
          eliminated = w; // never picked in a finished week
          continue;
        }
        const g = gameById.get(pk.game_id);
        const won = g ? gameWinner(g) === pk.team : false;
        picks.set(w, {
          week: w,
          game_id: pk.game_id,
          team: pk.team,
          result: won ? "win" : "loss",
          started: true,
        });
        if (!won) eliminated = w;
      } else if (pk) {
        const g = gameById.get(pk.game_id);
        const started = g?.starts_at ? new Date(g.starts_at).getTime() <= now : false;
        picks.set(w, {
          week: w,
          game_id: pk.game_id,
          team: pk.team,
          result: g?.status === "in_progress" ? "live" : "pending",
          started,
        });
      }
    }

    const usedBeforeCurrent: string[] = [];
    for (const [w, cell] of picks) {
      if (currentWeek !== null && w < currentWeek) usedBeforeCurrent.push(cell.team);
    }

    return {
      entry_id: e.id,
      user_id: e.user_id,
      display_name: e.profiles?.display_name ?? "Player",
      alive: eliminated === null,
      eliminated_week: eliminated,
      picks,
      usedBeforeCurrent,
    };
  });

  const alive = entries.filter((e) => e.alive);
  let decided = false;
  let champions: SurvivorEntryState[] = [];
  const lastGraded = weeks.filter((w) => gradedWeeks.has(w)).pop();
  if (entries.length > 0 && lastGraded !== undefined) {
    if (alive.length === 1) {
      decided = true;
      champions = alive;
    } else if (alive.length === 0) {
      // Everyone left died in the same week — they're co-champions.
      decided = true;
      champions = entries.filter((e) => e.eliminated_week === lastGraded);
    } else if (currentWeek === null) {
      // Slate ran out with multiple survivors (short playoff run) — co-champs.
      decided = true;
      champions = alive;
    }
  }

  return {
    gamesByWeek,
    weeks,
    gradedWeeks,
    currentWeek,
    firstKickoff,
    entries,
    aliveCount: alive.length,
    decided,
    champions,
  };
}
