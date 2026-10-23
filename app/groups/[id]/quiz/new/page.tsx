import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createQuiz } from "@/lib/quiz-actions";
import { QUIZ_CATEGORIES, QUIZ_COUNTS, QUIZ_DIFFICULTIES } from "@/lib/quiz";
import { Card, Field, SectionTitle, SubmitButton, inputClass } from "@/components/ui";

// UTC iso -> datetime-local value in Eastern. (Same helper as the
// pick'em form.)
function etLocal(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function NewQuizPage({
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

  const create = createQuiz.bind(null, id);
  const defaultClose = etLocal(new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString());

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>
      <div>
        <SectionTitle>New quiz — the Hot Seat</SectionTitle>
        <Card>
          <form action={create} className="space-y-4">
            <Field label="Title">
              <input name="title" defaultValue="Quiz Night" className={inputClass} />
            </Field>
            <Field label="Category">
              <select name="category" className={inputClass} defaultValue="Mixed">
                {QUIZ_CATEGORIES.map((c) => (
                  <option key={c.label} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Difficulty">
                <select name="difficulty" className={inputClass} defaultValue="medium">
                  {QUIZ_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Medium blends Easy and Medium questions — the bank's Medium runs hard.
                </p>
              </Field>
              <Field label="Questions">
                <select name="count" className={inputClass} defaultValue="10">
                  {QUIZ_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Closes (ET)">
              <input
                name="close_at"
                type="datetime-local"
                defaultValue={defaultClose}
                className={inputClass}
              />
            </Field>
            <p className="text-xs leading-relaxed text-slate-400">
              Everyone in the group gets one run at the same questions before it
              closes — 15 seconds a question, so nobody can look anything up. Most
              correct wins; ties go to the fastest total time. Winner takes +10 pts
              on the lifetime board.
            </p>
            <SubmitButton>Create quiz</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
