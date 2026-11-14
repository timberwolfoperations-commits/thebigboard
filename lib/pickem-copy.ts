// The How-it-works copy per pick'em variant. The creation form saves one of
// these as the pool's description; the pool page falls back to them when the
// description is blank — or when it matches the *other* variant's default,
// which repairs pools created while the form had the defaultValue bug.
export const STANDARD_HOW_IT_WORKS =
  "Pick the winner of every game. 1 point per correct pick — most points wins. Ties score for nobody.";

export const ATS_HOW_IT_WORKS =
  "Pick who covers the spread — not who wins the game. The number next to each game is the line: the favorite has to win by more than it, and the underdog can lose by less (or win outright). Lines were set when this pool was created and don't move. Land exactly on the number and it's a push — nobody gets the point. 1 point per cover, most points wins.";

export const OVER_UNDER_HOW_IT_WORKS =
  "Pick over or under on each prop — 1 point per correct side, most points wins. Props push (land exactly on the line) and score for nobody.";

export const CONFIDENCE_HOW_IT_WORKS =
  "Top 5 Confidence — pick any 5 games from the slate and rank them 5 to 1. Your 5 is the game you're most sure about, your 1 the least. A win pays its rank, so a perfect week is 15 points. Ties score for nobody, most points wins.";

export const CONFIDENCE_ATS_HOW_IT_WORKS =
  "Top 5 Confidence, against the spread — pick any 5 games from the slate and rank them 5 to 1. Your 5 is the game you're most sure about, your 1 the least. A win pays its rank, so a perfect week is 15 points. Picks grade against the line, not straight up: the favorite has to win by more than it, and the underdog can lose by less (or win outright). Lines were set when this pool was created and don't move. Land exactly on the number and it's a push — nobody gets the points. Ties score for nobody, most points wins.";

// College basketball only: the CBB sync refreshes each game's frozen
// line from the live line until that game tips off (closing-line
// behavior — lib/cbb-sync.ts), so the line you grade against is the
// line at tip-off, not the one you saw when you picked.
export const CONFIDENCE_ATS_CBB_HOW_IT_WORKS =
  "Top 5 Confidence, against the spread — pick any 5 games from the slate and rank them 5 to 1. Your 5 is the game you're most sure about, your 1 the least. A win pays its rank, so a perfect week is 15 points. Picks grade against the line, not straight up: the favorite has to win by more than it, and the underdog can lose by less (or win outright). Lines follow the live line until each game tips off, then freeze — you grade against the line at tip-off, not the one you saw when you picked. Land exactly on the number and it's a push — nobody gets the points. Ties score for nobody, most points wins.";
