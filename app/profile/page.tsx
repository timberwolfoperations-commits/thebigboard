import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateDisplayName, updateAvatar } from "@/lib/actions";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import { SignOutButton } from "@/components/AuthButtons";
import { Avatar } from "@/components/Avatar";
import { ANIMAL_LIST } from "@/lib/avatar-keys";
import { getRatings } from "@/lib/rating";

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

  // Avatar lives in its own query so a not-yet-run migration 026 leaves the
  // rest of the profile page working (currentAnimal just stays null).
  const { data: avatarRow } = await supabase
    .from("profiles")
    .select("avatar_animal")
    .eq("id", user.id)
    .maybeSingle();
  const currentAnimal = ((avatarRow as any)?.avatar_animal ?? null) as
    | string
    | null;

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

  // Player rating (RATING-SPEC.md): big number + the raw stat line.
  // The blend itself is never shown — "the formula's the formula."
  const myRating = (await getRatings(supabase, [user.id])).get(user.id);
  const pct = (x: number | null | undefined) =>
    x == null ? "—" : `${Math.round(x * 100)}%`;

  return (
    <div className="space-y-6">
      <SectionTitle>Your profile</SectionTitle>
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={profile?.display_name ?? "You"} animal={currentAnimal} size={56} />
          <div>
            <p className="font-display text-6xl font-bold leading-none tabular-nums">
              {myRating?.rating ?? "NR"}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Player rating
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Picks {pct(myRating?.pickAcc)} · Quiz {pct(myRating?.quizAcc)} ·{" "}
          {myRating?.titles ?? 0} {myRating?.titles === 1 ? "title" : "titles"} ·{" "}
          {myRating?.calls ?? 0} calls
        </p>
      </Card>
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
        <form action={updateAvatar}>
          <p className="text-sm font-semibold text-slate-700">Your mark</p>
          <p className="mt-1 text-xs text-slate-400">
            Sits next to your name on leaderboards. Black &amp; cream, like the
            wordmark. Tap one to set it — saves right away.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            <button
              type="submit"
              name="animal"
              value=""
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-xs font-medium ${
                currentAnimal === null
                  ? "border-slate-900 text-slate-900 ring-1 ring-slate-900"
                  : "border-slate-200 text-slate-500 hover:border-slate-400"
              }`}
            >
              <Avatar name={profile?.display_name ?? "You"} animal={null} size={44} />
              Initials
            </button>
            {ANIMAL_LIST.map((a) => (
              <button
                key={a.key}
                type="submit"
                name="animal"
                value={a.key}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-xs font-medium ${
                  currentAnimal === a.key
                    ? "border-slate-900 text-slate-900 ring-1 ring-slate-900"
                    : "border-slate-200 text-slate-500 hover:border-slate-400"
                }`}
              >
                <Avatar name={a.label} animal={a.key} size={44} />
                {a.label}
              </button>
            ))}
          </div>
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
