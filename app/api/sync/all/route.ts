import { NextResponse } from "next/server";
import { syncNfl } from "@/lib/nfl-sync";
import { syncMlb } from "@/lib/mlb-sync";

// One cron job for every sport. Vercel Hobby allows a single daily cron,
// so this runs NFL then MLB in one pass. Same CRON_SECRET auth as the
// per-sport routes; those keep working for manual per-sport triggers.
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
    return NextResponse.json({ ok: true, nfl, mlb });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sync failed" }, { status: 500 });
  }
}
