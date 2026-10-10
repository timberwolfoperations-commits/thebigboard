import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "@/components/AuthButtons";
import { Card } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="py-8 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-16 w-16 items-center justify-center bg-slate-900 font-display text-4xl font-bold text-white"
      >
        B
      </div>
      <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-none tracking-wide">
        The Big Board
      </h1>
      <p className="mx-auto mt-3 max-w-md text-slate-600">
        Bet your friends on anything. The bet is written down, both sides sign
        off, and the points live forever. No more &ldquo;that&rsquo;s not what we
        agreed on.&rdquo;
      </p>
      <div className="mt-6">
        <SignInButton />
      </div>

      <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
        <Card>
          <p className="font-display text-3xl font-bold text-accent">01</p>
          <p className="mt-2 font-semibold">Make the bet</p>
          <p className="mt-1 text-sm text-slate-600">
            Who&rsquo;s in, what&rsquo;s at stake, when it settles. Two taps.
          </p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold text-accent">02</p>
          <p className="mt-2 font-semibold">Both sides sign</p>
          <p className="mt-1 text-sm text-slate-600">
            Winners are confirmed by everyone in the bet. The contract holds.
          </p>
        </Card>
        <Card>
          <p className="font-display text-3xl font-bold text-accent">03</p>
          <p className="mt-2 font-semibold">Shame the slowpokes</p>
          <p className="mt-1 text-sm text-slate-600">
            Overdue bets land on the Deadbeat Board until someone settles up.
          </p>
        </Card>
      </div>
    </div>
  );
}
