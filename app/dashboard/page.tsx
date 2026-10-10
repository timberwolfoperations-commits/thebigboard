import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createGroup, joinGroup } from "@/lib/actions";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, groups(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const groups = ((memberships ?? []) as any[])
    .map((m) => ({ ...(m.groups as any), role: m.role }))
    .filter((g) => g.id);

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Your groups</SectionTitle>
        {groups.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              No groups. Start one for the crew — or paste an invite link
              from a friend.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`}>
                <Card className="transition hover:border-slate-400">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xl font-semibold uppercase tracking-wide">{g.name}</p>
                    {g.role === "admin" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        admin
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <SectionTitle>Create a group</SectionTitle>
          <form action={createGroup} className="space-y-3">
            <Field label="Group name">
              <input name="name" required placeholder="HS friends" className={inputClass} maxLength={60} />
            </Field>
            <SubmitButton>Create group</SubmitButton>
          </form>
        </Card>

        <Card>
          <SectionTitle>Join a group</SectionTitle>
          <form action={joinGroup} className="space-y-3">
            <Field label="Invite link or code">
              <input
                name="token"
                required
                placeholder="Paste the invite link"
                className={inputClass}
              />
            </Field>
            <SubmitButton>Join group</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
