// Pick'em bots: pool-scoped auto-pickers (migration 024). A bot is NOT a
// profile — it's a row in pickem_bots owned by one pool, with picks in
// pickem_bot_picks shaped like pickem_picks so the leaderboard and
// reveal read paths can union them in. Picks are generated ONCE, when
// the commish adds the bot, for games that haven't kicked off yet, and
// never regenerated — a bot lives and dies by its first card, same as a
// human who picked early.
//
// This module is the pure logic (no Supabase, no Next) so the picking
// rules can be tested on their own: personality + line -> a team.

export type BotPersonality = "chalk" | "fader" | "coin_flip";

export const BOT_PERSONALITIES: {
  value: BotPersonality;
  label: string;
  blurb: string;
}[] = [
  { value: "chalk", label: "Chalk", blurb: "takes the favorite, every time" },
  { value: "fader", label: "Fader", blurb: "takes the underdog, every time" },
  { value: "coin_flip", label: "Coin Flip", blurb: "no thoughts, just vibes" },
];

export function isBotPersonality(v: unknown): v is BotPersonality {
  return v === "chalk" || v === "fader" || v === "coin_flip";
}

export function botPersonalityLabel(v: string): string {
  return BOT_PERSONALITIES.find((p) => p.value === v)?.label ?? v;
}

// Suggested names, in the group chat's voice. The add form pre-fills the
// first one not already running in the pool; the commish can type over
// it (pre-filled default, never a placeholder to retype).
export const BOT_NAME_SUGGESTIONS = [
  "Chalky",
  "Vegas Vic",
  "The Algorithm",
  "Homer",
  "Public Pete",
  "Coin Flip Carl",
  "Sharp Steve",
  "The Fader",
];

export function suggestedBotName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (const name of BOT_NAME_SUGGESTIONS) {
    if (!taken.has(name.toLowerCase())) return name;
  }
  // Whole list is running — improbable (cap is 4), but never suggest a
  // duplicate: fall back to the first suggestion with a number on it.
  return `${BOT_NAME_SUGGESTIONS[0]} ${existingNames.length + 1}`;
}

export const MAX_BOTS_PER_POOL = 4;

// One game as the generator sees it. Spreads are the HOME team's number
// (negative = home favored), same convention as everywhere else: the
// frozen pool line wins when there is one, the game's live line is the
// fallback, and null means no line either place.
export interface BotGameInput {
  game_id: string;
  starts_at: string | null;
  home_team: string | null;
  away_team: string | null;
  frozen_spread: number | null;
  live_spread: number | null;
}

// Who's favored, from the home spread. Null when there's no usable
// line: nothing posted, or a true pick'em (0) where nobody is favored.
function favoriteSide(spread: number | null): "home" | "away" | null {
  if (spread == null || !Number.isFinite(spread) || spread === 0) return null;
  return spread < 0 ? "home" : "away";
}

// The pick for one game. rand is injectable so Coin Flip is testable;
// production callers leave the default.
export function botPickForGame(
  personality: BotPersonality,
  homeTeam: string,
  awayTeam: string,
  spread: number | null,
  rand: () => number = Math.random
): string {
  const home = String(homeTeam ?? "").toUpperCase();
  const away = String(awayTeam ?? "").toUpperCase();
  if (personality === "coin_flip") return rand() < 0.5 ? home : away;
  const fav = favoriteSide(spread);
  // No line (or a pick'em line): Chalk rides with the home crowd, Fader
  // takes the road team. With a line they take opposite sides of it.
  if (personality === "chalk") return fav === "away" ? away : home;
  return fav === "away" ? home : away; // fader
}

// The bot's whole card at add time: one pick per game that has NOT
// kicked off yet (starts_at > now). A game already underway gets no
// pick — the bot wears the same late-entry rules as a human who showed
// up Thursday at halftime.
export function buildBotPicks(
  personality: BotPersonality,
  games: BotGameInput[],
  nowMs: number,
  rand: () => number = Math.random
): { game_id: string; picked_team: string }[] {
  const picks: { game_id: string; picked_team: string }[] = [];
  for (const g of games) {
    if (g.starts_at == null) continue;
    if (new Date(g.starts_at).getTime() <= nowMs) continue;
    const spread = g.frozen_spread ?? g.live_spread;
    picks.push({
      game_id: g.game_id,
      picked_team: botPickForGame(
        personality,
        g.home_team ?? "",
        g.away_team ?? "",
        spread,
        rand
      ),
    });
  }
  return picks;
}
