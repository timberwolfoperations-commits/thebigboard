import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPool } from "@/lib/actions";
import PoolForm from "./pool-form";

export interface SlateGame {
  id: string;
  label: string;
  starts_at: string;
  defaultChecked: boolean;
}

// Upcoming NFL slate for the pool-creation checklist: games kicking off in
// the next 8 days. Sunday games come checked by default; Thursday/Monday
// games are listed unchecked so the commish can add them. If the table is
// empty (first run), sync from ESPN once before rendering.
async function loadSlateGames(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SlateGame[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 3600 * 1000);

  async function read() {
    const { data } = await supabase
      .from("games")
      .select("id, label, starts_at")
      .eq("sport", "NFL")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at", { ascending: true });
    return (data ?? []) as { id: string; label: string; starts_at: string }[];
  }

  let games = await read();
  if (games.length === 0) {
    try {
      const { syncNfl } = await import("@/lib/nfl-sync");
      await syncNfl();
      games = await read();
    } catch {
      // ESPN hiccup — the form still works, just without the checklist.
    }
  }

  return games.map((g) => ({
    id: g.id,
    label: g.label,
    starts_at: g.starts_at,
    defaultChecked:
      new Date(g.starts_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }) === "Sun",
  }));
}

export default async function NewPoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: member } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) redirect("/dashboard");

  const create = createPool.bind(null, id);
  const slateGames = await loadSlateGames(supabase);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <PoolForm action={create} games={slateGames} />
    </div>
  );
}
