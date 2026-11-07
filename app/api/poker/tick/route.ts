import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sweepAllTables } from "@/lib/poker/server";

// The poker clock sweep, hit by the same cron that runs the score
// syncs. For every running table it applies timeout auto-actions
// (check-or-fold) to players whose 8h/4h deadline has passed — chained
// straight past anyone already AWOL for the hand — and deals the next
// hand wherever a Mon/Wed/Fri 9:00 AM ET slot has landed with no hand
// live. Same CRON_SECRET auth as the sync routes.
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
    const summary = await sweepAllTables(createServiceClient(), new Date());
    return NextResponse.json({ ok: true, poker: summary });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "poker sweep failed" },
      { status: 500 },
    );
  }
}
