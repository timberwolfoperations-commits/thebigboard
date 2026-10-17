// Last-successful-sync watermark per sport, so the UI can say
// "updated N min ago" instead of implying real-time scores.

import { createServiceClient } from "./supabase/service";

export async function touchSyncState(sport: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase
      .from("sync_state")
      .upsert({ sport, synced_at: new Date().toISOString() }, { onConflict: "sport" });
  } catch {
    // Watermark is best-effort; never break a sync over it.
  }
}
