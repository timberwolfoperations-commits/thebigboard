import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptBetInvite } from "@/lib/actions";
import { SignInButton } from "@/components/AuthButtons";
import { Card, SubmitButton } from "@/components/ui";

// Bet-first invite: the visitor sees THE BET — title, terms, who's in —
// and one "Accept the bet" button. Accepting joins them to the group and
// the bet in a single step.
export default async function JoinBetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Safe peek: bet + group names only, no roster leak.
  const { data } = await supabase.rpc("get_bet_by_token", { p_token: token });
  const bet = Array.isArray(data) ? data[0] : data;

  if (!bet) {
    return (
      <Card className="text-center">
        <p className="font-display text-xl font-bold uppercase tracking-wide">
          That invite link doesn&rsquo;t work.
        </p>
        <p className="mt-1 text-sm text-slate-600">Ask your friend to send a fresh one.</p>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="text-center">
        <p className="font-display text-xl font-bold uppercase tracking-wider text-accent">
          You&rsquo;re invited to a bet
        </p>
        <p className="mt-3 font-display text-3xl font-bold uppercase leading-tight tracking-wide">
          {bet.bet_title}
        </p>
        {bet.bet_description && (
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{bet.bet_description}</p>
        )}
        <p className="mt-3 text-sm text-slate-500">
          {bet.bet_points} pts · in {bet.group_name} · {bet.participant_count}{" "}
          {bet.participant_count === 1 ? "person" : "people"} in so far
        </p>
        <p className="mt-1 text-sm text-slate-600">Sign in to accept your seat.</p>
        <div className="mt-5">
          <SignInButton next={`/join/bet/${token}`} />
        </div>
      </Card>
    );
  }

  // Already in the bet? Skip the pitch, go straight there.
  const { data: existing } = await supabase
    .from("bet_participants")
    .select("user_id")
    .eq("bet_id", bet.bet_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) redirect(`/groups/${bet.group_id}/bets/${bet.bet_id}`);

  const accept = acceptBetInvite.bind(null, token);

  return (
    <Card className="text-center">
      <p className="font-display text-xl font-bold uppercase tracking-wider text-accent">
        You&rsquo;re invited to a bet
      </p>
      <p className="mt-3 font-display text-3xl font-bold uppercase leading-tight tracking-wide">
        {bet.bet_title}
      </p>
      {bet.bet_description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{bet.bet_description}</p>
      )}
      <p className="mt-3 text-sm text-slate-500">
        {bet.bet_points} pts · in {bet.group_name} · {bet.participant_count}{" "}
        {bet.participant_count === 1 ? "person" : "people"} in so far
      </p>
      <form action={accept} className="mt-5">
        <SubmitButton>Accept the bet</SubmitButton>
      </form>
      <p className="mt-3 text-xs text-slate-400">
        Accepting joins you to {bet.group_name} too. One tap, you&rsquo;re in.
      </p>
    </Card>
  );
}
