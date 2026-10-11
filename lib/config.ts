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
