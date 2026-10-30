import { ANIMAL_ART, CREAM, INK, type AnimalKey } from "./avatar-art";

// A player's mark next to their name: the animal they picked on their
// profile, or their initials on the same black tile when they haven't
// picked one. Rendered as one SVG so the negative space (eyes, noses)
// always matches the tile exactly.
export function Avatar({
  name,
  animal,
  size = 28,
}: {
  name: string;
  animal?: string | null;
  size?: number;
}) {
  const art =
    animal && animal in ANIMAL_ART ? ANIMAL_ART[animal as AnimalKey] : null;

  if (!art) {
    const initials =
      name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";
    return (
      <span
        aria-hidden
        className="flex shrink-0 select-none items-center justify-center font-display font-bold"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.22),
          background: INK,
          color: CREAM,
          fontSize: Math.round(size * 0.42),
        }}
      >
        {initials}
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="shrink-0"
      style={{ color: CREAM }}
    >
      <rect width="48" height="48" rx="10.5" fill={INK} />
      <g fill={CREAM}>{art.half}</g>
      <g fill={CREAM} transform="translate(48 0) scale(-1 1)">
        {art.half}
      </g>
      <g fill={CREAM}>{art.center}</g>
    </svg>
  );
}
