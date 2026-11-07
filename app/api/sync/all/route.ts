import { NextResponse } from "next/server";
import { syncNfl } from "@/lib/nfl-sync";
import { syncMlb } from "@/lib/mlb-sync";
import { syncCfb } from "@/lib/cfb-sync";
import { createServiceClient } from "@/lib/supabase/service";
import { sweepAllTables } from "@/lib/poker/server";

// One cron job for every sport. Vercel Hobby allows a single daily cron,
// so this runs NFL then MLB in one pass. Same CRON_SECRET auth as the
// per-sport routes; those keep working for manual per-sport triggers.
//
// The poker clock rides this same 15-minute tick (cron-job.org only
// calls this route): the sweep applies timeout check-or-folds and
// deals due hands. It runs in its own try/catch — a poker hiccup must
// never fail the score syncs, so its summary (or error) just rides
// along in the response. /api/poker/tick remains for manual poking.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }

  const url = new URL(req.url);
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const nfl = await syncNfl();
    const mlb = await syncMlb();
    const cfb = await syncCfb();
    let poker: unknown;
    try {
      poker = await sweepAllTables(createServiceClient(), new Date());
    } catch (e: any) {
      poker = { error: e?.message ?? "poker sweep failed" };
    }
    return NextResponse.json({ ok: true, nfl, mlb, cfb, poker });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sync failed" }, { status: 500 });
  }
}
