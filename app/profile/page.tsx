import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateDisplayName } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";

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
      <Card>
        <p className="text-sm text-slate-500">
          Signed in as <span className="font-semibold text-slate-700">{user.email}</span>
        </p>
      </Card>
    </div>
  );
}
