import { createClient } from "@/lib/supabase/server";
import { joinGroup } from "@/lib/actions";
import { SignInButton } from "@/components/AuthButtons";
import { Card, SubmitButton } from "@/components/ui";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Safe peek: name + member count only, no roster leak.
  const { data } = await supabase.rpc("get_group_by_token", { p_token: token });
  const group = Array.isArray(data) ? data[0] : data;

  if (!group) {
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
        <p className="font-display text-2xl font-bold uppercase leading-tight tracking-wide">
          You&rsquo;re invited to {group.name}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {group.member_count} {group.member_count === 1 ? "person" : "people"} in the group. Sign in to
          claim your seat.
        </p>
        <div className="mt-5">
          <SignInButton next={`/join/${token}`} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <p className="font-display text-2xl font-bold uppercase leading-tight tracking-wide">Join {group.name}?</p>
      <p className="mt-1 text-sm text-slate-600">
        {group.member_count} {group.member_count === 1 ? "person" : "people"} in the group.
      </p>
      <form action={joinGroup} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <SubmitButton>Yes, I&rsquo;m in</SubmitButton>
      </form>
    </Card>
  );
}
