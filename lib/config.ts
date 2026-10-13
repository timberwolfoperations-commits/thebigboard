// Tuning knobs for the settlement lifecycle.
export const GRACE_DAYS = 3; // days past settle date before the deadbeat board
export const AUTO_SETTLE_DAYS = 7; // days past settle date before an undisputed proposal auto-settles

// Standard roster-pool rules, pre-filled in the form so the commish tweaks
// instead of retyping. Parameterized so it matches the pool's setup.
export function defaultPoolRules(rosterSize: number, budget: number): string {
  return `Pick ${rosterSize} player${rosterSize === 1 ? "" : "s"} under the $${budget} cap.

Scoring — hitters: 1B=1, 2B=2, 3B=3, HR=4, +1 run, +1 RBI, +2 SB, +1 BB/HBP. Pitchers: 1 per K, 1 per IP, +5 win, +4 save.

Most points wins. Tiebreak: combined total bases, then split.`;
}

// Standard scoring formula, pre-filled so the commish tweaks instead of
// retyping. Lines of "STAT, points per unit". A PTS line (weight 1) is the
// escape hatch for entering points directly.
export function defaultScoringFormula(): string {
  return `1B, 1
2B, 2
3B, 3
HR, 4
R, 1
RBI, 1
SB, 2
BB, 1
K, 1
IP, 1
W, 5
SV, 4`;
}

export type ScoringFormula = Record<string, number>;

// Pool-type presets for the new-pool form: picking one pre-fills the rules,
// scoring formula, cap, and roster size. Everything stays editable after.
// No sport identifier is stored on the pool — the formula is the source of
// truth, per the two-pool-type architecture (roster pools stay generic).
export interface PoolPreset {
  label: string;
  rosterSize: number;
  budget: number;
  rules: string;
  formula: string;
}

export const POOL_PRESETS: Record<string, PoolPreset> = {
  mlb: {
    label: "MLB Showdown",
    rosterSize: 3,
    budget: 30,
    rules: defaultPoolRules(3, 30),
    formula: defaultScoringFormula(),
  },
  nfl: {
    label: "NFL Sunday",
    rosterSize: 5,
    budget: 40,
    rules: `Pick 5 players under the $40 cap. One Sunday slate only.

Scoring: 0.04 per pass yard, 4 per pass TD, -2 per INT, 0.1 per rush yard, 6 per rush TD, 0.5 per reception, 0.1 per receiving yard, 6 per receiving TD, -2 per fumble lost.

Most points wins. Tiebreak: most total TDs, then split.`,
    formula: `pass_yd, 0.04
pass_td, 4
int, -2
rush_yd, 0.1
rush_td, 6
rec, 0.5
rec_yd, 0.1
rec_td, 6
fum_lost, -2`,
  },
};

// Lines of "STAT, points per unit" — same paste pattern as the player list.
// Weights can be negative (INTs, fumbles lost).
export function parseScoringFormula(raw: string): ScoringFormula {
  const formula: ScoringFormula = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(",").map((s) => s.trim());
    if (parts.length < 2) throw new Error(`Can't parse formula line: "${line}" — use STAT, points.`);
    const key = parts[0].toUpperCase();
    const val = parseFloat(parts[1]);
    if (!key || !Number.isFinite(val)) throw new Error(`Can't parse formula line: "${line}".`);
    if (formula[key] !== undefined) throw new Error(`Duplicate stat in formula: ${key}.`);
    formula[key] = val;
  }
  if (Object.keys(formula).length === 0) throw new Error("The scoring formula needs at least one stat.");
  return formula;
}

export function calcPoints(stats: Record<string, number>, formula: ScoringFormula): number {
  let total = 0;
  for (const [k, v] of Object.entries(stats)) {
    total += (formula[k.toUpperCase()] ?? 0) * v;
  }
  return Math.round(total * 100) / 100;
}
