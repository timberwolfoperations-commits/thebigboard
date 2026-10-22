import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateDisplayName } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import { SignOutButton } from "@/components/AuthButtons";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // Scoring is a commish tool — only surface it to group admins (same rule
  // as the layout/header menu). It lives here now that the mobile header
  // no longer carries the hamburger menu.
  const { data: adminRow } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  const isAdmin = Boolean(adminRow);

  return (
    <div className="space-y-6">
      <SectionTitle>Your profile</SectionTitle>
      <Card>
        <form action={updateDisplayName} className="space-y-4">
          <div>
            <label htmlFor="display_name" className="mb-1 block text-sm font-semibold text-slate-700">
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              maxLength={40}
              defaultValue={profile?.display_name ?? ""}
              placeholder="What should the group call you?"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              This is the name everyone sees on leaderboards and picks.
            </p>
          </div>
          <SubmitButton>Save name</SubmitButton>
        </form>
      </Card>
      {isAdmin && (
        <Card>
          <Link href="/scoring" className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline">
            Scoring — commish tools →
          </Link>
          <p className="mt-1 text-xs text-slate-400">Stat grids and score refresh, for group admins.</p>
        </Card>
      )}
      <Card>
        <p className="text-sm text-slate-500">
          Signed in as <span className="font-semibold text-slate-700">{user.email}</span>
        </p>
        <div className="mt-3">
          <SignOutButton />
        </div>
      </Card>
    </div>
  );
}
