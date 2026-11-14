import { NextResponse } from "next/server";
import { syncCbb } from "@/lib/cbb-sync";

// Scheduled ESPN sync (men's college basketball, scoreboard + odds).
// Same CRON_SECRET auth as the other per-sport routes.
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
    const result = await syncCbb();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sync failed" }, { status: 500 });
  }
}
