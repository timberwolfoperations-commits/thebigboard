// Commissioner lockdown tests — run with: npx tsx scripts/commissioner-tests.ts
// The pure pieces of lib/commissioner.ts: who the site commissioner
// is (by email), whether creation is locked for a given user, and the
// guard behavior — throws the friendly message for locked-out users,
// no-ops for the commissioner. The server/UI wiring around these
// needs a database and a browser; these cases pin the decision logic
// itself, including the exact-email rule (case/whitespace tolerant,
// lookalikes rejected) that the whole lockdown stands on.

import {
  COMMISSIONER_LOCKDOWN,
  LOCKDOWN_ADMIN_MESSAGE,
  LOCKDOWN_MESSAGE,
  SITE_COMMISSIONER_EMAIL,
  assertCanAdminister,
  assertCanCreate,
  creationLockedFor,
  isSiteCommissioner,
} from "../lib/commissioner";

// ------------------------------------------------------------ harness

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function throwsWith(fn: () => void, message: string): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return (e as Error).message === message;
  }
}

// ------------------------------------------------------------ the commissioner

check("the commissioner is the commissioner", isSiteCommissioner({ email: SITE_COMMISSIONER_EMAIL }));
check(
  "email match is case-insensitive",
  isSiteCommissioner({ email: SITE_COMMISSIONER_EMAIL.toUpperCase() })
);
check(
  "email match tolerates surrounding whitespace",
  isSiteCommissioner({ email: `  ${SITE_COMMISSIONER_EMAIL} ` })
);
check("a lookalike email is not the commissioner", !isSiteCommissioner({ email: "timberwolfoperations@gmail.co" }));
check("another real user is not the commissioner", !isSiteCommissioner({ email: "buddy@example.com" }));
check("no email is not the commissioner", !isSiteCommissioner({ email: null }));
check("no user is not the commissioner", !isSiteCommissioner(null) && !isSiteCommissioner(undefined));

// ------------------------------------------------------------ the lock

// These expectations assume the lockdown ships ON (the module's
// current constant). If launch day flips it, this block is the canary:
// update it in the same commit that flips the switch.
check("lockdown is on (pre-launch)", COMMISSIONER_LOCKDOWN === true);
check("locked for a regular user", creationLockedFor({ email: "buddy@example.com" }));
check("locked for an anonymous shape", creationLockedFor(null));
check("not locked for the commissioner", !creationLockedFor({ email: SITE_COMMISSIONER_EMAIL }));

// ------------------------------------------------------------ the guards

check(
  "assertCanCreate throws the friendly create message for a regular user",
  throwsWith(() => assertCanCreate({ email: "buddy@example.com" }), LOCKDOWN_MESSAGE)
);
check(
  "assertCanAdminister throws the friendly admin message for a regular user",
  throwsWith(() => assertCanAdminister({ email: "buddy@example.com" }), LOCKDOWN_ADMIN_MESSAGE)
);
check(
  "both guards no-op for the commissioner",
  !throwsWith(() => assertCanCreate({ email: SITE_COMMISSIONER_EMAIL }), LOCKDOWN_MESSAGE) &&
    !throwsWith(() => assertCanAdminister({ email: SITE_COMMISSIONER_EMAIL }), LOCKDOWN_ADMIN_MESSAGE)
);

// ------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
