// Stat keys offered for over/under props. Keys must match game_stat_lines
// keys EXACTLY — read from lib/nfl-sync.ts (lowercase) and lib/mlb-sync.ts
// (uppercase). Do not invent new ones here; the feed is the source of
// truth and an unknown key grades as 0 for everyone.

export interface PropStat {
  key: string;
  label: string;
  sport: "NFL" | "MLB";
}

export const PROP_STATS: PropStat[] = [
  // -- NFL (lib/nfl-sync.ts)
  { key: "pass_yd", label: "Pass yards", sport: "NFL" },
  { key: "pass_td", label: "Pass TDs", sport: "NFL" },
  { key: "rush_yd", label: "Rush yards", sport: "NFL" },
  { key: "rush_td", label: "Rush TDs", sport: "NFL" },
  { key: "rec", label: "Receptions", sport: "NFL" },
  { key: "rec_yd", label: "Receiving yards", sport: "NFL" },
  { key: "rec_td", label: "Receiving TDs", sport: "NFL" },
  // -- MLB (lib/mlb-sync.ts)
  { key: "1B", label: "Singles", sport: "MLB" },
  { key: "HR", label: "Home runs", sport: "MLB" },
  { key: "R", label: "Runs", sport: "MLB" },
  { key: "RBI", label: "RBIs", sport: "MLB" },
  { key: "SB", label: "Stolen bases", sport: "MLB" },
  { key: "BB", label: "Walks", sport: "MLB" },
  { key: "K", label: "Strikeouts", sport: "MLB" },
  { key: "IP", label: "Innings pitched", sport: "MLB" },
];

export const PROP_STAT_LABELS: Record<string, string> = Object.fromEntries(
  PROP_STATS.map((s) => [s.key, s.label])
);

export const VALID_PROP_KEYS: Set<string> = new Set(PROP_STATS.map((s) => s.key));
