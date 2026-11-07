// Poker — the clock math. Pure functions, no I/O, same style as the
// engine: the spec's schedule is "a hand every ~2 days" dealt Mon /
// Wed / Fri at 9:00 AM Eastern, your first decision of a hand gets 8
// hours, every later one 4.
//
// All the calendar work happens in America/New_York via Intl — never
// via fixed UTC offsets — so 9:00 AM ET stays 9:00 AM ET across the
// spring-forward and fall-back weekends (covered by
// scripts/poker-schedule-tests.ts).

const ET = "America/New_York";
const DEADLINE_FIRST_MS = 8 * 60 * 60 * 1000;
const DEADLINE_LATER_MS = 4 * 60 * 60 * 1000;

// JS weekday convention: 0 = Sunday … 6 = Saturday.
const DEAL_WEEKDAYS = new Set([1, 3, 5]); // Mon, Wed, Fri
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface EtParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

function etParts(instant: Date): EtParts {
  const parts: Record<string, string> = {};
  for (const p of etFormatter.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday],
  };
}

// The UTC instant whose America/New_York wall clock reads
// year-month-day hour:minute. Guesses UTC, reads back the ET wall
// clock of the guess, and corrects by the difference — two passes
// settle it even when the correction crosses a DST boundary (9:00 AM
// is never inside the 2 AM transition window itself).
export function etWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = etParts(new Date(t));
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = target - wallAsUtc;
    if (delta === 0) break;
    t += delta;
  }
  return new Date(t);
}

// The next Mon/Wed/Fri 09:00 ET strictly after `after`.
export function nextDealSlot(after: Date): Date {
  const start = etParts(after);
  for (let offset = 0; offset <= 7; offset++) {
    // Roll the ET calendar date forward (Date.UTC normalizes month
    // and year overflow), then check its weekday.
    const dayUtc = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const weekday = dayUtc.getUTCDay();
    if (!DEAL_WEEKDAYS.has(weekday)) continue;
    const candidate = etWallToUtc(
      dayUtc.getUTCFullYear(),
      dayUtc.getUTCMonth() + 1,
      dayUtc.getUTCDate(),
      9,
      0,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // Unreachable: a Mon/Wed/Fri occurs within any 7-day window.
  throw new Error("No deal slot found within a week");
}

// When the current actor's clock runs out: 8 hours for a player's
// first decision of a hand, 4 hours for every later one.
export function deadlineFor(isFirstActionOfHand: boolean, now: Date): Date {
  return new Date(now.getTime() + (isFirstActionOfHand ? DEADLINE_FIRST_MS : DEADLINE_LATER_MS));
}
