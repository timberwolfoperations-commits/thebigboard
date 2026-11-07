// Web push — sending. Server-only (imports the service-role client
// and the VAPID private key). Callers: the poker machinery in
// lib/poker/server.ts; anything else that later wants to tap a player
// on the shoulder goes through here too.
//
// The golden rule: a notification failure must NEVER fail the thing
// that triggered it. Every export swallows every error — no VAPID
// keys (feature off), no subscriptions, a dead endpoint, a push
// service outage — and resolves quietly. Dead endpoints (404/410)
// are pruned so the table stays honest.

import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isGoneSubscription,
  serializePushPayload,
  vapidConfigFrom,
  type PushPayloadInput,
} from "@/lib/push-payload";

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidReady = false;

// Configure web-push once per process. Returns false when the keys
// aren't all set — the feature is off and every send is a no-op.
// Key material is passed to the library and never logged.
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const config = vapidConfigFrom(process.env);
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  vapidReady = true;
  return true;
}

async function sendToSubscription(sub: SubscriptionRow, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return false; // delivered (or at least accepted) — keep the row
  } catch (e) {
    const statusCode = (e as { statusCode?: number } | null)?.statusCode;
    return isGoneSubscription(statusCode);
  }
}

// Tap one player on the shoulder, on every device they've turned on.
export async function sendPushToUser(userId: string, input: PushPayloadInput): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const service = createServiceClient();
    const { data, error } = await service
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error || !data || data.length === 0) return;

    const payload = serializePushPayload(input);
    const goneIds: string[] = [];
    for (const sub of data as SubscriptionRow[]) {
      if (await sendToSubscription(sub, payload)) goneIds.push(sub.id);
    }
    if (goneIds.length > 0) {
      await service.from("push_subscriptions").delete().in("id", goneIds);
    }
  } catch {
    // Notifications are a courtesy, never a dependency. Stay silent.
  }
}

// The same tap, fanned out — deduped, and one player's dead phone
// never delays or breaks anyone else's.
export async function sendPushToUsers(userIds: string[], input: PushPayloadInput): Promise<void> {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((id) => sendPushToUser(id, input)));
}
