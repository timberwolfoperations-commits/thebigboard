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
