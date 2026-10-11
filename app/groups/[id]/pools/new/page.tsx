import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPool } from "@/lib/actions";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";

function todayAt8pmET(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}T20:00`;
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

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <Card>
        <SectionTitle>New roster pool</SectionTitle>
        <form action={create} className="space-y-4">
          <Field label="What's the pool?">
            <input
              name="name"
              required
              maxLength={120}
              placeholder="NLCS Series Showdown"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Salary cap ($)">
              <input name="budget" type="number" min={1} max={10000} defaultValue={30} className={inputClass} />
            </Field>
            <Field label="Players per entry">
              <input name="roster_size" type="number" min={1} max={20} defaultValue={3} className={inputClass} />
            </Field>
          </div>

          <Field label="Picks lock (Eastern)">
            <input name="lock_at" type="datetime-local" required defaultValue={todayAt8pmET()} className={inputClass} />
          </Field>

          <p className="text-sm text-slate-500">
            After creating it, paste the player list as lines of <span className="font-mono">Name, TEAM, salary</span>.
            You&rsquo;ll enter per-game points after each game — the app is the ledger, not the referee.
          </p>

          <SubmitButton>Create pool</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
