// The How-it-works copy per pick'em variant. The creation form saves one of
// these as the pool's description; the pool page falls back to them when the
// description is blank — or when it matches the *other* variant's default,
// which repairs pools created while the form had the defaultValue bug.
export const STANDARD_HOW_IT_WORKS =
  "Pick the winner of every game. 1 point per correct pick — most points wins. Ties score for nobody.";

export const OVER_UNDER_HOW_IT_WORKS =
  "Pick over or under on each prop — 1 point per correct side, most points wins. Props push (land exactly on the line) and score for nobody.";
