import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import PokerCreateForm from "@/components/poker-create-form";
import LockdownNotice from "@/components/lockdown-notice";
import { creationLockedFor } from "@/lib/commissioner";

export default async function NewPokerTablePage({
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
  if (creationLockedFor(user)) return <LockdownNotice groupId={id} />;

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>
      <div>
        <SectionTitle>Start a poker table</SectionTitle>
        <Card>
          <PokerCreateForm groupId={id} />
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm leading-relaxed text-slate-600">
              Slow-play hold&rsquo;em — you&rsquo;re in with{" "}
              <span className="font-semibold text-slate-900">100 chips</span>, and the rest
              of the group taps <span className="font-semibold text-slate-900">I&rsquo;m in</span>{" "}
              to take a seat, up to ten at a table. A hand is dealt{" "}
              <span className="font-semibold text-slate-900">
                Monday, Wednesday and Friday at 9:00 AM ET
              </span>
              ; your first decision of a hand gets{" "}
              <span className="font-semibold text-slate-900">8 hours</span>, every one after
              that <span className="font-semibold text-slate-900">4 hours</span>, and no answer
              means you check if it&rsquo;s free or fold if there&rsquo;s a bet. Blinds climb
              every three hands until somebody&rsquo;s standing — the winner banks{" "}
              <span className="font-semibold text-slate-900">10 lifetime points</span>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
