import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createSurvivorPool } from "@/lib/survivor-actions";
import { Card, Field, SectionTitle, SubmitButton, inputClass } from "@/components/ui";

function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NewSurvivorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Start weeks on offer: any NFL week whose first game hasn't kicked off.
  const { data: games } = await supabase
    .from("games")
    .select("season, week, starts_at")
    .eq("sport", "NFL")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  const firstByWeek = new Map<string, { season: number; week: number; starts_at: string }>();
  for (const g of (games ?? []) as any[]) {
    const key = `${g.season}:${g.week}`;
    if (!firstByWeek.has(key)) {
      firstByWeek.set(key, { season: g.season, week: g.week, starts_at: g.starts_at });
    }
  }
  const options = [...firstByWeek.values()];

  const create = createSurvivorPool.bind(null, id);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>
      <div>
        <SectionTitle>New survivor pool</SectionTitle>
        {options.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No upcoming NFL weeks are loaded yet — games load about a week ahead, so
              check back closer to the week you want to start.
            </p>
          </Card>
        ) : (
          <Card>
            <form action={create} className="space-y-4">
              <Field label="Pool name">
                <input name="name" defaultValue="NFL Survivor" className={inputClass} />
              </Field>
              <Field label="Starts">
                <select name="start" className={inputClass} defaultValue={`${options[0].season}:${options[0].week}`}>
                  {options.map((o) => (
                    <option key={`${o.season}:${o.week}`} value={`${o.season}:${o.week}`}>
                      Week {o.week} · first game {fmtKickoff(o.starts_at)} ET
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs leading-relaxed text-slate-400">
                Everyone gets one entry. Pick one team a week — win and advance, lose and
                you&rsquo;re out, no team twice. Entries close at the first kickoff of the
                start week.
              </p>
              <SubmitButton>Create survivor pool</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
