// The Final 5 modifiers for the Thanksgiving Showdown (and any
// showdown-style roster pool: players carry a game_number). Each entry
// assigns all five, one per pick — a permutation, locked with the entry
// at the pool's single lock. Legacy roster pools never set a modifier
// and score exactly as before.
//
// Bonus rules (settled by Michael, 2026-11-22):
//   DD     Double Down:    base × max(1.10, 1 + 1/n), n = entries that
//                          drafted the player. Negative base scores
//                          are NOT multiplied (1.00x).
//   PLUS5  Add +5:         flat +5, unconditional.
//   SOLO   Solo Legend:    +10 if n == 1 (only you rostered him).
//   WINNER Winner's Circle: +8 if his team wins AND he scores 10+ base.
//   WILD   Wildcard:       +15 for a 40+ yard TD or the game-winning TD
//                          (passer + receiver both earn credit on a
//                          passing TD; capped at +15 once per pick).

import type { ScoringPlay } from "./nfl-sync";

export type ModifierCode = "DD" | "PLUS5" | "SOLO" | "WINNER" | "WILD";

export const MODIFIER_CODES: ModifierCode[] = ["DD", "PLUS5", "SOLO", "WINNER", "WILD"];

export const MODIFIERS: {
  code: ModifierCode;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    code: "DD",
    label: "Double Down",
    short: "2x",
    hint: "Multiplies that pick — 2x if you're the only one on him, less the more entries own him (floor 1.10x).",
  },
  {
    code: "PLUS5",
    label: "Add +5",
    short: "+5",
    hint: "Flat +5 on that pick, no matter what.",
  },
  {
    code: "SOLO",
    label: "Solo Legend",
    short: "SOLO",
    hint: "+10 if you're the only entry who rostered him.",
  },
  {
    code: "WINNER",
    label: "Winner's Circle",
    short: "WIN",
    hint: "+8 if his team wins and he scores 10+ base points.",
  },
  {
    code: "WILD",
    label: "Wildcard",
    short: "WILD",
    hint: "+15 for a 40+ yard TD or the game-winning TD.",
  },
];

export const MODIFIER_LABELS: Record<ModifierCode, string> = Object.fromEntries(
  MODIFIERS.map((m) => [m.code, m.label])
) as Record<ModifierCode, string>;

export const MODIFIER_SHORTS: Record<ModifierCode, string> = Object.fromEntries(
  MODIFIERS.map((m) => [m.code, m.short])
) as Record<ModifierCode, string>;

export function isModifierCode(v: unknown): v is ModifierCode {
  return typeof v === "string" && (MODIFIER_CODES as string[]).includes(v.toUpperCase());
}

// ESPN writes names two ways: the boxscore displayName ("James Cook")
// and the scoring-play text ("James Cook III", "D.J. Moore"). Normalize
// both the same way so a wildcard credit matches the pool player:
// uppercase, drop periods, collapse spaces, strip a trailing suffix
// (II / III / IV / JR / SR).
export function normPlayerName(s: unknown): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(II|III|IV|JR|SR)$/, "");
}

// A wildcard-credit key: normalized "TEAM|NAME". The team is the scoring
// team — on a passing TD both the receiver and the passer are on it.
export function wildcardKey(team: string, name: string): string {
  return `${String(team ?? "").trim().toUpperCase()}|${normPlayerName(name)}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Wildcard credit -------------------------------------------------------
// Returns the set of wildcard keys credited in one game: every player
// who scored (or threw) a 40+ yard TD, plus the scorer (and passer) of
// the game-winning TD. The +15 is capped at once per pick, so a set is
// all the scoring needs.
//
// 40+ yard TD: any Passing or Rushing Touchdown whose yardage is >= 40.
//   Credited live, as soon as the play happens.
// Game-winning TD: the TD on which the winning team takes a lead they
//   never relinquish — the earliest TD by the eventual winner after
//   which the winner is ahead after every subsequent scoring play.
//   Only determinable once the game is final; a tie has no winner and
//   no game-winning TD.
export function wildcardCreditsForGame(
  plays: ScoringPlay[],
  game: { status: string; home_team: string | null; away_team: string | null }
): Set<string> {
  const credited = new Set<string>();
  const ordered = [...plays].sort((a, b) => a.seq - b.seq);
  const isTd = (p: ScoringPlay) => /touchdown/i.test(p.type_text);

  for (const p of ordered) {
    if (!isTd(p)) continue;
    if (p.yardage != null && p.yardage >= 40 && p.scorer_name) {
      credited.add(wildcardKey(p.team, p.scorer_name));
      if (p.passer_name) credited.add(wildcardKey(p.team, p.passer_name));
    }
  }

  if (game.status === "final" && ordered.length > 0) {
    const last = ordered[ordered.length - 1];
    const home = (game.home_team ?? "").toUpperCase();
    const away = (game.away_team ?? "").toUpperCase();
    let winner: string | null = null;
    if (last.home_score > last.away_score) winner = home;
    else if (last.away_score > last.home_score) winner = away;
    if (winner) {
      const winnerAhead = (p: ScoringPlay) =>
        winner === home ? p.home_score > p.away_score : p.away_score > p.home_score;
      for (let i = 0; i < ordered.length; i++) {
        const td = ordered[i];
        if (!isTd(td) || td.team.toUpperCase() !== winner) continue;
        if (!winnerAhead(td)) continue;
        let holds = true;
        for (let j = i + 1; j < ordered.length; j++) {
          if (!winnerAhead(ordered[j])) {
            holds = false;
            break;
          }
        }
        if (holds && td.scorer_name) {
          credited.add(wildcardKey(td.team, td.scorer_name));
          if (td.passer_name) credited.add(wildcardKey(td.team, td.passer_name));
        }
        if (holds) break;
      }
    }
  }

  return credited;
}

// --- Modifier bonus --------------------------------------------------------
// The bonus one pick earns, on top of its base fantasy points. `base` is
// the pick's base points (before modifiers); `ownership` is n, the number
// of entries in the pool that drafted this player; `teamWon` is whether
// the player's team won its (final) game — null when the game isn't final
// or tied; `wildcardCredit` is whether the player is in the game's
// wildcard-credit set.
export function modifierBonus(input: {
  base: number;
  modifier: ModifierCode | null;
  ownership: number;
  teamWon: boolean | null;
  wildcardCredit: boolean;
}): number {
  const { base, modifier, ownership, teamWon, wildcardCredit } = input;
  if (!modifier) return 0;
  switch (modifier) {
    case "DD": {
      // Never multiply a negative base score.
      if (base <= 0) return 0;
      const mult = Math.max(1.1, 1 + 1 / Math.max(1, ownership));
      return round2(base * (mult - 1));
    }
    case "PLUS5":
      return 5;
    case "SOLO":
      return ownership === 1 ? 10 : 0;
    case "WINNER":
      return teamWon === true && base >= 10 ? 8 : 0;
    case "WILD":
      return wildcardCredit ? 15 : 0;
  }
}
