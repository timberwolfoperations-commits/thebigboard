import { NextResponse } from "next/server";
import { syncNfl } from "@/lib/nfl-sync";

// Scheduled ESPN sync. Vercel cron sends `Authorization: Bearer $CRON_SECRET`
// automatically; the ?secret= fallback is for manual curl triggers.
// The commish "Refresh scores" button goes through a server action instead,
// so the secret never touches the client.
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
    const result = await syncNfl();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sync failed" }, { status: 500 });
  }
}
