// Web push — the pure pieces. No imports, no I/O: payload shaping,
// VAPID config reading, and dead-endpoint classification live here so
// scripts/push-tests.ts can pin them without a browser, a database,
// or the web-push package. lib/notify.ts does the actual sending.

export interface PushPayloadInput {
  title: string;
  body: string;
  url: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
}

export const PUSH_ICON_PATH = "/icons/icon-192.png";

// What actually goes over the wire to the push service (and what
// public/sw.js parses): the caller's title/body/url plus the app icon.
export function shapePushPayload(input: PushPayloadInput): PushPayload {
  return {
    title: input.title,
    body: input.body,
    url: input.url,
    icon: PUSH_ICON_PATH,
  };
}

export function serializePushPayload(input: PushPayloadInput): string {
  return JSON.stringify(shapePushPayload(input));
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

// The feature's env contract. Returns null when ANY piece is missing
// or blank — every push code path treats null as "feature off" and
// no-ops silently, so deploying before the keys exist is safe.
export function vapidConfigFrom(env: Record<string, string | undefined>): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// Push services answer 404 (unknown) or 410 (gone) for subscriptions
// that will never work again — those rows get pruned at send time.
// Anything else (400, 429, 5xx) is transient or a bug: keep the row.
export function isGoneSubscription(statusCode: number | undefined | null): boolean {
  return statusCode === 404 || statusCode === 410;
}

// ------------------------------------------------------- test push
//
// The diagnostic pieces for the Profile "Send test notification"
// button (sendTestPush in lib/push-actions.ts). Unlike the real
// sender in lib/notify.ts — which swallows every error by design —
// the test send REPORTS what happened, so these types and helpers
// shape that report. Nothing here ever carries key material, a full
// endpoint, or subscription keys: host only, status codes, and short
// error messages.

export const TEST_PUSH_INPUT: PushPayloadInput = {
  title: "Test notification — The Big Board",
  body: "Push is working. This is the test you asked for.",
  url: "/profile",
};

export type TestPushOutcome =
  | "not-signed-in"
  | "vapid-missing"
  | "vapid-invalid"
  | "lookup-failed"
  | "no-subscriptions"
  | "done";

export interface TestPushSubscriptionResult {
  host: string | null; // endpoint host only — never the full endpoint
  delivered: boolean;
  statusCode: number | null; // push service HTTP status, when it answered
  error: string | null; // short message from web-push, when it failed
  pruned: boolean; // true when a 404/410 got the row deleted
}

export interface TestPushResult {
  outcome: TestPushOutcome;
  vapidConfigured: boolean; // all three VAPID env vars present and non-blank
  vapidError: string | null; // setVapidDetails complaint, when outcome is "vapid-invalid"
  subscriptionCount: number;
  results: TestPushSubscriptionResult[];
}

// The push service a subscription talks to, by host only (e.g.
// "web.push.apple.com"). The full endpoint is a per-device channel
// credential and never leaves the server.
export function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host || null;
  } catch {
    return null;
  }
}

// A web-push / VAPID error reduced to a short, safe one-liner for the
// page: the Error's message, whitespace collapsed, capped so a push
// service's verbose response can never sprawl (or smuggle a long
// blob) into the UI or a log. Non-Error throwables get a plain label.
export function shortErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return "Unknown error";
  return clean.length > 160 ? `${clean.slice(0, 159)}…` : clean;
}

export function countDelivered(results: TestPushSubscriptionResult[]): number {
  return results.filter((r) => r.delivered).length;
}
