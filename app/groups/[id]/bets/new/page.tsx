import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createBet } from "@/lib/actions";
import { Card, SectionTitle, Field, inputClass, SubmitButton } from "@/components/ui";

export default async function NewBetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(display_name)")
    .eq("group_id", id);
  const memberList = ((members ?? []) as any[]).map((m) => ({
    user_id: m.user_id,
    name: m.profiles?.display_name ?? "Player",
  }));
  if (!memberList.some((m) => m.user_id === user.id)) redirect("/dashboard");

  const defaultDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const create = createBet.bind(null, id);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <Card>
        <SectionTitle>New bet</SectionTitle>
        <form action={create} className="space-y-4">
          <Field label="What's the bet?">
            <input name="title" required maxLength={120} placeholder="Most steps in November" className={inputClass} />
          </Field>

          <Field label="Details (optional)">
            <textarea
              name="description"
              rows={2}
              maxLength={500}
              placeholder="Counted by phone health app. Screenshots on the 1st."
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Points at stake">
              <input name="points" type="number" min={0} max={10000} defaultValue={10} className={inputClass} />
            </Field>
            <Field label="Settles on">
              <input name="settle_date" type="date" required defaultValue={defaultDate} className={inputClass} />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Who&rsquo;s in? <span className="font-normal text-slate-500">(they&rsquo;ll each get an invite to accept)</span>
            </span>
            <div className="space-y-1 rounded-xl border border-slate-200 p-3">
              {memberList.map((m) => (
                <label key={m.user_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="participants"
                    value={m.user_id}
                    defaultChecked={m.user_id === user.id}
                    className="h-4 w-4 accent-slate-900"
                  />
                  {m.name}
                  {m.user_id === user.id && <span className="text-xs text-slate-400">(you)</span>}
                </label>
              ))}
            </div>
          </div>

          <SubmitButton>Lock it in</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
