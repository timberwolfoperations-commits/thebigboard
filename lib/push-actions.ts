"use server";

import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@/lib/supabase/server";
import {
  TEST_PUSH_INPUT,
  endpointHost,
  isGoneSubscription,
  serializePushPayload,
  shortErrorMessage,
  vapidConfigFrom,
  type TestPushResult,
  type TestPushSubscriptionResult,
} from "@/lib/push-payload";

// Push subscription bookkeeping for the toggle in
// components/push-toggle.tsx. Runs on the SESSION client, so the
// owner-only RLS on push_subscriptions (migration 028) is the actual
// enforcement: a caller can only ever write rows for themselves.
// Unauthenticated calls are quiet no-ops — the toggle only renders
// for signed-in users anyway, and a stale tab shouldn't explode.

export interface SaveSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function saveSubscription(input: SaveSubscriptionInput): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) return { ok: false };

  // Upsert on the endpoint: re-subscribing the same browser (fresh
  // keys after a permission reset, a new user on a shared device)
  // refreshes the row instead of piling up duplicates.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: input.userAgent ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return { ok: !error };
}

// ------------------------------------------------------------ test push
//
// The diagnostic counterpart to lib/notify.ts. The real sender
// swallows every error on purpose (a failed tap must never fail a
// poker hand); this one exists to find out WHY nothing arrived, so
// it reports everything back to the caller as data: is the server's
// VAPID config complete, did setVapidDetails accept it, how many
// subscription rows the signed-in player has, and per subscription
// whether the push service accepted it (HTTP status) or rejected it
// (status + short error). Sends ONLY to the caller's own rows — the
// session client + owner-only RLS enforce that, same as above.
// Dead subscriptions (404/410) are pruned, exactly like notify.ts.
// Nothing secret is returned or logged: no key material, no full
// endpoints (host only), no subscription keys.
export async function sendTestPush(): Promise<TestPushResult> {
  const config = vapidConfigFrom(process.env);
  const base: TestPushResult = {
    outcome: "done",
    vapidConfigured: config !== null,
    vapidError: null,
    subscriptionCount: 0,
    results: [],
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...base, outcome: "not-signed-in" };

  // All three vars present is necessary but not sufficient — the
  // library also validates them (subject must be a URL, usually
  // mailto:; keys must be the right shape). A throw here is the
  // prime suspect when the toggle says "on" but nothing ever lands,
  // so it gets its own outcome instead of a generic failure.
  if (!config) return { ...base, outcome: "vapid-missing" };
  try {
    setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (e) {
    return { ...base, outcome: "vapid-invalid", vapidError: shortErrorMessage(e) };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);
  if (error) return { ...base, outcome: "lookup-failed" };
  const subs = (data ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (subs.length === 0) return { ...base, outcome: "no-subscriptions" };

  const payload = serializePushPayload(TEST_PUSH_INPUT);
  const results: TestPushSubscriptionResult[] = [];
  const goneIds: string[] = [];
  for (const sub of subs) {
    const host = endpointHost(sub.endpoint);
    try {
      const res = await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      results.push({
        host,
        delivered: true,
        statusCode: res.statusCode,
        error: null,
        pruned: false,
      });
    } catch (e) {
      const statusCode =
        (e as { statusCode?: number } | null)?.statusCode ?? null;
      const pruned = isGoneSubscription(statusCode);
      if (pruned) goneIds.push(sub.id);
      results.push({
        host,
        delivered: false,
        statusCode,
        error: shortErrorMessage(e),
        pruned,
      });
    }
  }
  if (goneIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", goneIds);
  }

  return { ...base, subscriptionCount: subs.length, results };
}

export async function removeSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !endpoint) return { ok: false };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  return { ok: !error };
}
