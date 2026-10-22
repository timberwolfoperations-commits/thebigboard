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
