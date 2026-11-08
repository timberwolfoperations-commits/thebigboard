// Push tests — run with: npx tsx scripts/push-tests.ts
// The pure pieces of web push (lib/push-payload.ts): the payload that
// goes over the wire, the VAPID env contract, and which HTTP statuses
// mean "this subscription is gone, prune it". The sending itself needs
// a browser, a push service, and real keys — none of that is faked
// here; these cases pin the parts that can silently rot.

import {
  PUSH_ICON_PATH,
  TEST_PUSH_INPUT,
  countDelivered,
  endpointHost,
  isGoneSubscription,
  serializePushPayload,
  shapePushPayload,
  shortErrorMessage,
  vapidConfigFrom,
  type TestPushSubscriptionResult,
} from "../lib/push-payload";

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

// ------------------------------------------------------- payload shape

const shaped = shapePushPayload({
  title: "Your move — Poker Night",
  body: "Hand 3 · move by Fri 2:15 PM ET",
  url: "/groups/g1/poker/t1",
});
check("payload keeps the caller's title", shaped.title === "Your move — Poker Night");
check("payload keeps the caller's body", shaped.body === "Hand 3 · move by Fri 2:15 PM ET");
check("payload keeps the caller's url", shaped.url === "/groups/g1/poker/t1");
check("payload carries the app icon", shaped.icon === PUSH_ICON_PATH);

const wire = serializePushPayload({
  title: "Hand 4 dealt — Poker Night",
  body: "Blinds 2/4. First decision window: 8 hours.",
  url: "/groups/g1/poker/t1",
});
const parsed = JSON.parse(wire) as Record<string, unknown>;
check(
  "serialized payload round-trips as JSON with every field sw.js reads",
  parsed.title === "Hand 4 dealt — Poker Night" &&
    parsed.body === "Blinds 2/4. First decision window: 8 hours." &&
    parsed.url === "/groups/g1/poker/t1" &&
    parsed.icon === PUSH_ICON_PATH,
);

// ------------------------------------------------------ vapid contract

const full = vapidConfigFrom({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:a@b.c",
});
check(
  "all three keys set -> config",
  full !== null && full.publicKey === "pub" && full.privateKey === "priv" && full.subject === "mailto:a@b.c",
);
check("no keys at all -> feature off", vapidConfigFrom({}) === null);
check(
  "missing private key -> feature off",
  vapidConfigFrom({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_SUBJECT: "mailto:a@b.c" }) === null,
);
check(
  "missing public key -> feature off",
  vapidConfigFrom({ VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.c" }) === null,
);
check(
  "missing subject -> feature off",
  vapidConfigFrom({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" }) === null,
);
check(
  "blank key counts as missing -> feature off",
  vapidConfigFrom({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "  ",
    VAPID_PRIVATE_KEY: "priv",
    VAPID_SUBJECT: "mailto:a@b.c",
  }) === null,
);

// ------------------------------------------------- gone classification

check("410 Gone -> prune", isGoneSubscription(410));
check("404 Not Found -> prune", isGoneSubscription(404));
check("200 -> keep", !isGoneSubscription(200));
check("400 -> keep (our bug, not a dead phone)", !isGoneSubscription(400));
check("429 -> keep (rate limited, retry later)", !isGoneSubscription(429));
check("500 -> keep (push service outage)", !isGoneSubscription(500));
check("no status (network error) -> keep", !isGoneSubscription(undefined) && !isGoneSubscription(null));

// ------------------------------------------------- test-push report

const testWire = JSON.parse(serializePushPayload(TEST_PUSH_INPUT)) as Record<string, unknown>;
check(
  "test payload is the labelled test notification to /profile",
  testWire.title === "Test notification — The Big Board" &&
    testWire.body === "Push is working. This is the test you asked for." &&
    testWire.url === "/profile" &&
    testWire.icon === PUSH_ICON_PATH,
);

check(
  "endpoint host is host only for Apple push",
  endpointHost("https://web.push.apple.com/QABC123rest-of-the-endpoint") === "web.push.apple.com",
);
check(
  "endpoint host works for FCM",
  endpointHost("https://fcm.googleapis.com/fcm/send/abc:def") === "fcm.googleapis.com",
);
check("endpoint host of garbage -> null", endpointHost("not a url") === null);
check("endpoint host of empty string -> null", endpointHost("") === null);

check(
  "short error keeps a normal message",
  shortErrorMessage(new Error("Vapid subject is not a valid URL.")) ===
    "Vapid subject is not a valid URL.",
);
check(
  "short error collapses whitespace",
  shortErrorMessage(new Error("line one\n\n  line   two")) === "line one line two",
);
check(
  "short error caps a sprawling message at 160 chars",
  shortErrorMessage(new Error("x".repeat(500))).length === 160,
);
check("short error of a non-error -> plain label", shortErrorMessage(42) === "Unknown error");
check("short error of nothing -> plain label", shortErrorMessage(null) === "Unknown error");

const mixedResults: TestPushSubscriptionResult[] = [
  { host: "web.push.apple.com", delivered: true, statusCode: 201, error: null, pruned: false },
  { host: "fcm.googleapis.com", delivered: false, statusCode: 410, error: "gone", pruned: true },
  { host: "fcm.googleapis.com", delivered: true, statusCode: 201, error: null, pruned: false },
];
check("delivered count counts only the accepted sends", countDelivered(mixedResults) === 2);
check("delivered count of no results is zero", countDelivered([]) === 0);

// -------------------------------------------------------------- report

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  process.exit(1);
}
