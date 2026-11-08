import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import PushToggle from "@/components/push-toggle";
import SetupSteps from "@/components/setup-steps";

// "Get the buzz" — the install + notifications walkthrough the
// dashboard banner points at. Two minutes, phone-first: get Big
// Board on the Home Screen (the only way push exists on iPhone),
// then flip notifications on — the switch itself is at the bottom of
// this page (the same PushToggle as Profile, test button included),
// so the walkthrough finishes where it stands.
export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Get buzzed when it&rsquo;s your move</SectionTitle>
        <p className="-mt-1 text-sm leading-relaxed text-slate-500">
          Two minutes, once. Big Board lands on your Home Screen like a real app, and
          your phone buzzes when the poker clock lands on you or a new hand is dealt —
          no more checking the app to see whose turn it is.
        </p>
      </div>

      <Card>
        <SetupSteps />
      </Card>

      <Card>
        <p className="text-sm font-semibold text-slate-700">The switch</p>
        <PushToggle />
      </Card>
    </div>
  );
}
