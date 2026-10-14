import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPool } from "@/lib/actions";
import { loadSlateGames, loadMlbSlateGames } from "@/lib/slate";
import PoolForm from "./pool-form";

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
  const mlbGames = await loadMlbSlateGames(supabase);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <PoolForm action={create} games={slateGames} mlbGames={mlbGames} />
    </div>
  );
}
