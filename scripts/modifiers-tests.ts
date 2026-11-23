// Final 5 modifiers tests — run with: npx tsx scripts/modifiers-tests.ts
// The pure pieces of lib/modifiers.ts and lib/nfl-sync.ts (parseScoringPlays):
// ESPN scoring-play parsing, wildcard credit (40+ yard TD + game-winning
// TD), name normalization, and the per-pick modifier bonus math.
//
// The scoring-play fixtures are the REAL Week 11 summaries (MIA @ BUF and
// TEN @ DAL, 2026-11-22), trimmed to the fields the parser reads — the
// spec's assumed fields (scoreValue, statYardage, participants) do not
// exist in the real response, so the fixtures deliberately omit them.

import { parseScoringPlays } from "../lib/nfl-sync";
import {
  MODIFIER_CODES,
  modifierBonus,
  normPlayerName,
  wildcardCreditsForGame,
} from "../lib/modifiers";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// --- fixtures: real ESPN scoringPlays, trimmed to what the parser reads ---
type P = { id: string; type: { text: string }; text: string; awayScore: number; homeScore: number; period: { number: number }; clock: { value: number }; team: { abbreviation: string } };
const play = (
  id: string,
  type: string,
  text: string,
  away: number,
  home: number,
  team: string,
  period = 2,
  clock = 600
): P => ({
  id,
  type: { text: type },
  text,
  awayScore: away,
  homeScore: home,
  period: { number: period },
  clock: { value: clock },
  team: { abbreviation: team },
});

const MIA_BUF: P[] = [
  play("1", "Field Goal Good", "Tyler Bass 43 Yd Field Goal", 0, 3, "BUF", 1, 664),
  play("2", "Field Goal Good", "Tyler Bass 54 Yd Field Goal", 0, 6, "BUF", 1, 300),
  play("3", "Passing Touchdown", "DJ Moore 4 Yd pass from Josh Allen (Tyler Bass Kick)", 0, 13, "BUF", 2, 803),
  play("4", "Field Goal Good", "Daniel Carlson 52 Yd Field Goal", 3, 13, "MIA", 2, 400),
  play("5", "Rushing Touchdown", "James Cook III 1 Yd Rush (Tyler Bass Kick)", 3, 20, "BUF", 2, 100),
  play("6", "Field Goal Good", "Daniel Carlson 52 Yd Field Goal", 6, 20, "MIA", 3, 700),
  play("7", "Field Goal Good", "Daniel Carlson 27 Yd Field Goal", 9, 20, "MIA", 3, 200),
  play("8", "Field Goal Good", "Tyler Bass 40 Yd Field Goal", 9, 23, "BUF", 4, 500),
  play("9", "Field Goal Good", "Tyler Bass 28 Yd Field Goal", 9, 26, "BUF", 4, 100),
];

const TEN_DAL: P[] = [
  play("1", "Rushing Touchdown", "Javonte Williams 1 Yd Rush (Two-Point Pass Conversion Failed)", 0, 6, "DAL", 1, 800),
  play("2", "Field Goal Good", "Joey Slye 38 Yd Field Goal", 3, 6, "TEN", 1, 300),
  play("3", "Rushing Touchdown", "KaVontae Turpin 22 Yd Rush (Brandon Aubrey Kick)", 3, 13, "DAL", 1, 100),
  play("4", "Passing Touchdown", "CeeDee Lamb 8 Yd pass from Dak Prescott (Brandon Aubrey Kick)", 3, 20, "DAL", 2, 700),
  play("5", "Field Goal Good", "Joey Slye 48 Yd Field Goal", 6, 20, "TEN", 2, 400),
  play("6", "Passing Touchdown", "George Pickens 10 Yd pass from Dak Prescott (Brandon Aubrey Kick)", 6, 27, "DAL", 2, 200),
  play("7", "Field Goal Good", "Joey Slye 28 Yd Field Goal", 9, 27, "TEN", 3, 600),
  play("8", "Rushing Touchdown", "Cam Ward 1 Yd Rush (Joey Slye Kick)", 16, 27, "TEN", 3, 300),
  play("9", "Passing Touchdown", "Javonte Williams 11 Yd pass from Dak Prescott (Brandon Aubrey Kick)", 16, 34, "DAL", 3, 100),
  play("10", "Passing Touchdown", "Carnell Tate 59 Yd pass from Cam Ward (Joey Slye Kick)", 23, 34, "TEN", 3, 439),
  play("11", "Rushing Touchdown", "Dak Prescott 2 Yd Rush (Brandon Aubrey Kick)", 23, 41, "DAL", 4, 700),
  play("12", "Field Goal Good", "Brandon Aubrey 49 Yd Field Goal", 23, 44, "DAL", 4, 400),
  play("13", "Passing Touchdown", "Brevyn Spann-Ford 2 Yd pass from Dak Prescott (Brandon Aubrey Kick)", 23, 51, "DAL", 4, 200),
  play("14", "Passing Touchdown", "Calvin Ridley 12 Yd pass from Cam Ward (Joey Slye Kick)", 30, 51, "TEN", 4, 100),
];

// --- parseScoringPlays ---
const mia = parseScoringPlays(MIA_BUF as any);
check("parse: 9 plays from MIA@BUF", mia.length === 9, `got ${mia.length}`);
check(
  "parse: passing TD gives scorer + passer + yardage",
  mia[2].scorer_name === "DJ Moore" && mia[2].passer_name === "Josh Allen" && mia[2].yardage === 4,
  JSON.stringify(mia[2])
);
check(
  "parse: rushing TD gives scorer + yardage, no passer",
  mia[4].scorer_name === "James Cook III" && mia[4].passer_name === null && mia[4].yardage === 1,
  JSON.stringify(mia[4])
);
check(
  "parse: field goal has yardage but no scorer",
  mia[0].yardage === 43 && mia[0].scorer_name === null,
  JSON.stringify(mia[0])
);
const dal = parseScoringPlays(TEN_DAL as any);
check(
  "parse: 59-yard pass TD parses scorer + passer + yardage",
  dal[9].scorer_name === "Carnell Tate" && dal[9].passer_name === "Cam Ward" && dal[9].yardage === 59,
  JSON.stringify(dal[9])
);
check("parse: seq follows the play order", dal[0].seq === 0 && dal[13].seq === 13);

// --- wildcardCreditsForGame ---
const miaCredits = wildcardCreditsForGame(mia, { status: "final", home_team: "BUF", away_team: "MIA" });
check(
  "wildcard MIA@BUF: game-winning TD credits DJ Moore + Josh Allen, nothing else",
  eq([...miaCredits].sort(), ["BUF|DJ MOORE", "BUF|JOSH ALLEN"]),
  [...miaCredits].join(", ")
);
const dalCredits = wildcardCreditsForGame(dal, { status: "final", home_team: "DAL", away_team: "TEN" });
check(
  "wildcard TEN@DAL: game-winning TD (Javonte Williams) + 59-yd TD (Carnell Tate, Cam Ward)",
  eq([...dalCredits].sort(), ["DAL|JAVONTE WILLIAMS", "TEN|CAM WARD", "TEN|CARNELL TATE"]),
  [...dalCredits].join(", ")
);

// Lead tied after an early TD: the early TD is NOT the game-winning TD,
// the later one (after the tie) is.
const RELINQUISHED: P[] = [
  play("1", "Rushing Touchdown", "Early Back 5 Yd Rush", 0, 7, "A", 1, 800),
  play("2", "Rushing Touchdown", "Other Back 5 Yd Rush", 7, 7, "B", 1, 400),
  play("3", "Rushing Touchdown", "Early Back 5 Yd Rush", 7, 14, "A", 2, 700),
  play("4", "Field Goal Good", "Kicker 30 Yd Field Goal", 10, 14, "B", 2, 300),
  play("5", "Rushing Touchdown", "Other Back 5 Yd Rush", 17, 14, "B", 3, 600),
  play("6", "Rushing Touchdown", "Late Back 5 Yd Rush", 17, 21, "A", 3, 300),
  play("7", "Field Goal Good", "Kicker 30 Yd Field Goal", 20, 21, "B", 4, 400),
  play("8", "Field Goal Good", "Kicker 30 Yd Field Goal", 20, 24, "A", 4, 100),
];
const relCredits = wildcardCreditsForGame(parseScoringPlays(RELINQUISHED as any), {
  status: "final",
  home_team: "A",
  away_team: "B",
});
check(
  "wildcard: TD before a relinquished lead is not the game-winning TD",
  relCredits.has("A|LATE BACK") && !relCredits.has("A|EARLY BACK"),
  [...relCredits].join(", ")
);

// Tie game: no game-winning TD, only a 40+ yard TD credits.
const TIE: P[] = [
  play("1", "Passing Touchdown", "Long Receiver 45 Yd pass from Passer One", 7, 0, "A", 1, 800),
  play("2", "Rushing Touchdown", "Other Back 5 Yd Rush", 7, 7, "B", 2, 400),
];
const tieCredits = wildcardCreditsForGame(parseScoringPlays(TIE as any), {
  status: "final",
  home_team: "A",
  away_team: "B",
});
check(
  "wildcard: tie game has no game-winning TD, 45-yd TD still credits",
  eq([...tieCredits].sort(), ["A|LONG RECEIVER", "A|PASSER ONE"]),
  [...tieCredits].join(", ")
);

// Live game: 40+ yard TD credits now; game-winning TD waits for final.
const liveCredits = wildcardCreditsForGame(dal, { status: "in_progress", home_team: "DAL", away_team: "TEN" });
check(
  "wildcard: live game credits the 40+ yard TD only",
  eq([...liveCredits].sort(), ["TEN|CAM WARD", "TEN|CARNELL TATE"]),
  [...liveCredits].join(", ")
);

// --- normPlayerName ---
check("norm: strips III suffix", normPlayerName("James Cook III") === "JAMES COOK");
check("norm: drops periods (A.J. -> AJ)", normPlayerName("A.J. Brown") === "AJ BROWN");
check("norm: DJ Moore unchanged apart from case", normPlayerName("DJ Moore") === "DJ MOORE");

// --- modifierBonus ---
const base = (modifier: any, extra: any = {}) =>
  modifierBonus({ base: 21, modifier, ownership: 1, teamWon: null, wildcardCredit: false, ...extra });
check("DD: n=1 doubles (bonus = base)", base("DD") === 21);
check("DD: n=2 is 1.50x", base("DD", { ownership: 2 }) === 10.5);
check("DD: n=3 is 1.333x", base("DD", { ownership: 3 }) === 7);
check("DD: n=5 is 1.20x", base("DD", { ownership: 5 }) === 4.2);
check("DD: n=10 floors at 1.10x", base("DD", { ownership: 10 }) === 2.1);
check("DD: n=20 still floors at 1.10x", base("DD", { ownership: 20 }) === 2.1);
check("DD: negative base is not multiplied", base("DD", { base: -2 }) === 0);
check("DD: zero base pays nothing", base("DD", { base: 0 }) === 0);
check("PLUS5: flat +5", base("PLUS5") === 5);
check("SOLO: n=1 pays +10", base("SOLO") === 10);
check("SOLO: n=2 pays 0", base("SOLO", { ownership: 2 }) === 0);
check("SOLO: no point threshold — 0 base still pays", base("SOLO", { base: 0 }) === 10);
check("WINNER: win + 10 base pays +8", base("WINNER", { teamWon: true, base: 10 }) === 8);
check("WINNER: win + 9.9 base pays 0", base("WINNER", { teamWon: true, base: 9.9 }) === 0);
check("WINNER: loss pays 0", base("WINNER", { teamWon: false, base: 25 }) === 0);
check("WINNER: non-final (null) pays 0", base("WINNER", { teamWon: null, base: 25 }) === 0);
check("WILD: credited pays +15", base("WILD", { wildcardCredit: true }) === 15);
check("WILD: not credited pays 0", base("WILD") === 0);
check("no modifier pays 0", base(null) === 0);
check("five modifier codes", eq(MODIFIER_CODES, ["DD", "PLUS5", "SOLO", "WINNER", "WILD"]));

// ------------------------------------------------------------ summary
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
