"use server";

import { createClient } from "@/lib/supabase/server";

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
