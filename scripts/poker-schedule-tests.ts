// Poker schedule tests — run with: npx tsx scripts/poker-schedule-tests.ts
// The deal clock is Mon/Wed/Fri 9:00 AM America/New_York. Every case
// below pins the expected slot as a UTC instant (EST = UTC-5,
// EDT = UTC-4), including across both 2026 DST transitions, so a
// fixed-offset bug cannot pass silently.

import { deadlineFor, nextDealSlot } from "../lib/poker/schedule";

// ------------------------------------------------------------ harness

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function slot(name: string, afterIso: string, expectedIso: string): void {
  const got = nextDealSlot(new Date(afterIso));
  check(
    name,
    got.getTime() === Date.parse(expectedIso),
    `got ${got.toISOString()}, want ${expectedIso}`,
  );
}

const etClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

// ------------------------------------------------------- ordinary weeks
// January 2026: Thu 1st, Fri 2nd, Sat 3rd, Mon 5th, Wed 7th. All EST.

slot("Mon 8:00 AM ET -> same Mon 9:00", "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z");
slot("Mon exactly 9:00 AM ET -> Wed (strictly after)", "2026-01-05T14:00:00Z", "2026-01-07T14:00:00Z");
slot("Mon 10:30 AM ET -> Wed 9:00", "2026-01-05T15:30:00Z", "2026-01-07T14:00:00Z");
slot("Sat noon ET -> Mon 9:00", "2026-01-03T17:00:00Z", "2026-01-05T14:00:00Z");
slot("Sun 11 PM ET -> Mon 9:00", "2026-01-05T04:00:00Z", "2026-01-05T14:00:00Z");
slot("Fri 8:00 AM ET -> same Fri 9:00", "2026-01-02T13:00:00Z", "2026-01-02T14:00:00Z");
slot("Fri 10:00 AM ET -> Mon 9:00", "2026-01-02T15:00:00Z", "2026-01-05T14:00:00Z");
slot("Wed 9:00 AM ET exactly -> Fri 9:00", "2026-01-07T14:00:00Z", "2026-01-09T14:00:00Z");

// ------------------------------------------- spring forward (Mar 8 2026)
// EST until Sun Mar 8 2:00 AM, EDT after. The Mon Mar 9 slot is the
// first one on the new offset — it must read 9:00 EDT (13:00 UTC), not
// drift to 10:00 EDT the way a fixed UTC-5 offset would.

slot("Wed before spring-forward -> Fri 9:00 EST", "2026-03-04T15:00:00Z", "2026-03-06T14:00:00Z");
slot("Fri before spring-forward -> Mon 9:00 EDT", "2026-03-06T15:00:00Z", "2026-03-09T13:00:00Z");
slot("Sat before spring-forward -> Mon 9:00 EDT", "2026-03-07T17:00:00Z", "2026-03-09T13:00:00Z");
slot("Sun after spring-forward -> Mon 9:00 EDT", "2026-03-08T16:00:00Z", "2026-03-09T13:00:00Z");

{
  const s = nextDealSlot(new Date("2026-03-06T15:00:00Z"));
  const label = etClock.format(s);
  check("spring-forward slot reads Mon 9:00 AM in ET", label.startsWith("Mon") && label.includes("9:00 AM"), label);
}

// ---------------------------------------------- fall back (Nov 1 2026)
// EDT until Sun Nov 1 2:00 AM, EST after. The Mon Nov 2 slot must read
// 9:00 EST (14:00 UTC), not 8:00 EST.

slot("Wed before fall-back -> Fri 9:00 EDT", "2026-10-28T14:00:00Z", "2026-10-30T13:00:00Z");
slot("Fri before fall-back -> Mon 9:00 EST", "2026-10-30T14:00:00Z", "2026-11-02T14:00:00Z");
slot("Sat before fall-back -> Mon 9:00 EST", "2026-10-31T16:00:00Z", "2026-11-02T14:00:00Z");
slot("Sun after fall-back -> Mon 9:00 EST", "2026-11-01T17:00:00Z", "2026-11-02T14:00:00Z");

{
  const s = nextDealSlot(new Date("2026-10-30T14:00:00Z"));
  const label = etClock.format(s);
  check("fall-back slot reads Mon 9:00 AM in ET", label.startsWith("Mon") && label.includes("9:00 AM"), label);
}

// ------------------------------------------------------------ deadlines

{
  const now = new Date("2026-01-05T14:00:00Z");
  const first = deadlineFor(true, now);
  const later = deadlineFor(false, now);
  check(
    "first decision of a hand gets 8h",
    first.getTime() - now.getTime() === 8 * 60 * 60 * 1000,
    first.toISOString(),
  );
  check(
    "later decisions get 4h",
    later.getTime() - now.getTime() === 4 * 60 * 60 * 1000,
    later.toISOString(),
  );
}

// -------------------------------------------------------------- summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(`Failing: ${failures.join("; ")}`);
  process.exit(1);
}
