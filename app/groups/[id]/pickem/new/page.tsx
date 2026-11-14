import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPickemPool } from "@/lib/pickem-actions";
import { loadSlateGames, loadMlbSlateGames, loadCfbSlateGames } from "@/lib/slate";
import PickemForm from "./pickem-form";
import LockdownNotice from "@/components/lockdown-notice";
import { creationLockedForGroup } from "@/lib/commissioner";

export default async function NewPickemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: member } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) redirect("/dashboard");
  if (creationLockedForGroup(user, member.role)) return <LockdownNotice groupId={id} />;

  const create = createPickemPool.bind(null, id);
  const [nflGames, mlbGames, cfbGames] = await Promise.all([
    loadSlateGames(supabase),
    loadMlbSlateGames(supabase),
    loadCfbSlateGames(supabase),
  ]);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <PickemForm action={create} nflGames={nflGames} mlbGames={mlbGames} cfbGames={cfbGames} />
    </div>
  );
}
