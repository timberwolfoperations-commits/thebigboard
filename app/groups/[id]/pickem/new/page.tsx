import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPickemPool } from "@/lib/pickem-actions";
import { loadSlateGames, loadMlbSlateGames } from "@/lib/slate";
import PickemForm from "./pickem-form";

export default async function NewPickemPage({ params }: { params: Promise<{ id: string }> }) {
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

  const create = createPickemPool.bind(null, id);
  const [nflGames, mlbGames] = await Promise.all([
    loadSlateGames(supabase),
    loadMlbSlateGames(supabase),
  ]);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <PickemForm action={create} nflGames={nflGames} mlbGames={mlbGames} />
    </div>
  );
}
