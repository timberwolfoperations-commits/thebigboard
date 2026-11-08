import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import { LOCKDOWN_MESSAGE } from "@/lib/commissioner";

// What a non-commissioner sees when they land on a create page
// directly (typed URL, stale link) while the lockdown is on. The
// create menus hide these routes for them, and the server actions
// refuse the submit — this is the friendly front door for the gap
// between the two.
export default function LockdownNotice({ groupId }: { groupId: string }) {
  return (
    <div className="space-y-6">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-slate-500 underline-offset-4 hover:underline"
      >
        ← Back to group
      </Link>
      <div>
        <SectionTitle>Locked for now</SectionTitle>
        <Card>
          <p className="text-sm leading-relaxed text-slate-600">{LOCKDOWN_MESSAGE}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Everything else still works — picks, bets, quizzes, poker. If it needs
            playing, it&rsquo;s open.
          </p>
        </Card>
      </div>
    </div>
  );
}
