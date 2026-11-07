// Poker — card model and deck. Pure logic, no I/O, same style as
// lib/quiz.ts: the rules live here so they can be verified without a
// database or a browser.

export type Suit = "s" | "h" | "d" | "c";

// A card is a rank (2–14, where 11=J, 12=Q, 13=K, 14=A) plus a suit.
// Plain data on purpose — hands are compared by evaluate.ts, and cards
// travel through the engine as values, never as class instances.
export interface Card {
  rank: number;
  suit: Suit;
}

const SUITS: Suit[] = ["s", "h", "d", "c"];
const RANK_CHARS = "23456789TJQKA"; // index 0 = rank 2 … index 12 = ace

// A fresh, ordered 52-card deck: ranks 2→A within each suit.
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// Random source returning [0, 1). Injectable so tests can deal the
// same shuffle every run; production passes Math.random.
export type Rng = () => number;

// Fisher–Yates shuffle. Returns a new array; the input is untouched.
export function shuffle(deck: Card[], rng: Rng): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// "As", "Td", "9c" — handy in tests and logs.
export function cardToString(card: Card): string {
  return RANK_CHARS[card.rank - 2] + card.suit;
}

// Parse "As" / "Td" / "9c" back into a Card. Throws on anything else.
export function parseCard(text: string): Card {
  if (text.length !== 2) throw new Error(`Bad card: ${text}`);
  const rank = RANK_CHARS.indexOf(text[0].toUpperCase()) + 2;
  const suit = text[1].toLowerCase() as Suit;
  if (rank < 2 || !SUITS.includes(suit)) throw new Error(`Bad card: ${text}`);
  return { rank, suit };
}

// Parse a space-separated run like "As Kd 7c" — test shorthand.
export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).map(parseCard);
}
