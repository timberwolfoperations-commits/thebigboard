import type { Card } from "@/lib/poker/cards";

// Playing-card tiles in the mockup's language: white tile, rank in
// Barlow Condensed over the suit glyph, hearts/diamonds in the muted
// red (#a83a2a). A face-down card is the black tile with a cream B —
// the same tile the avatars use.

const RANK_LABEL: Record<number, string> = {
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const SUIT_GLYPH: Record<Card["suit"], string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

// "K♠" — for story lines and street headers.
export function cardText(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_GLYPH[card.suit]}`;
}

export function isRed(card: Card): boolean {
  return card.suit === "h" || card.suit === "d";
}

const SIZES = {
  sm: { tile: "h-14 w-10 rounded-md", rank: "text-xl", suit: "text-base" },
  md: { tile: "h-[78px] w-14 rounded-lg", rank: "text-[27px]", suit: "text-[19px]" },
  lg: { tile: "h-[90px] w-16 rounded-lg", rank: "text-[31px]", suit: "text-[22px]" },
} as const;

export function PokerCard({
  card,
  size = "md",
}: {
  card: Card;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <div
      className={`flex flex-col items-center justify-center border border-[#d8d3c8] bg-white shadow-[0_2px_6px_rgba(20,20,20,0.06)] ${s.tile} ${
        isRed(card) ? "text-[#a83a2a]" : "text-slate-900"
      }`}
    >
      <span className={`font-display font-bold leading-none ${s.rank}`}>
        {rankLabel(card.rank)}
      </span>
      <span className={`leading-tight ${s.suit}`}>{SUIT_GLYPH[card.suit]}</span>
    </div>
  );
}

export function CardBack({
  label,
  size = "md",
}: {
  label?: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <div
      className={`flex flex-col items-center justify-center border border-[#141414] bg-[#141414] ${s.tile}`}
    >
      <span className="font-display text-[21px] font-bold leading-none text-[#f7f4ef] opacity-90">
        B
      </span>
      {label && (
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#b6b0a2]">
          {label}
        </span>
      )}
    </div>
  );
}
