import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  proposeOutcome,
  approveSettlement,
  disputeBet,
  adminForceSettle,
  adminVoidBet,
  adminResolveDispute,
  type BetDetail,
} from "@/lib/actions";
import { Card, SectionTitle, Field, inputClass, SubmitButton, DangerButton, StatusBadge } from "@/components/ui";

export default async function BetPage({
  params,
}: {
  params: Promise<{ id: string; betId: string }>;
}) {
  const { id, betId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Load via the same rules as the actions (RLS enforces membership).
  const { data: bet } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!bet) redirect(`/groups/${id}`);
  const { data: parts } = await supabase
    .from("bet_participants")
    .select("user_id, approved, profiles(display_name)")
    .eq("bet_id", betId);

  const detail: BetDetail = {
    ...bet,
    participants: ((parts ?? []) as any[]).map((p) => ({
      user_id: p.user_id,
      approved: p.approved,
      display_name: p.profiles?.display_name ?? "Player",
    })),
  };

  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/dashboard");
  const isAdmin = membership.role === "admin";

  const me = detail.participants.find((p) => p.user_id === user.id);
  const isParticipant = !!me;
  const winnerName = detail.participants.find((p) => p.user_id === detail.proposed_winner_id)?.display_name;

  const propose = proposeOutcome.bind(null, betId);
  const approve = approveSettlement.bind(null, betId);
  const dispute = disputeBet.bind(null, betId);
  const forceSettle = adminForceSettle.bind(null, betId);
  const voidBet = adminVoidBet.bind(null, betId);
  const resolveDispute = adminResolveDispute.bind(null, betId);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-black tracking-tight">{detail.title}</h1>
          <StatusBadge status={detail.status} />
        </div>
        {detail.description && <p className="mt-2 text-sm text-slate-600">{detail.description}</p>}
        <p className="mt-3 text-sm text-slate-500">
          {detail.points} points · settles {detail.settle_date}
        </p>

        <div className="mt-4">
          <SectionTitle>In the bet</SectionTitle>
          <div className="space-y-1">
            {detail.participants.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between text-sm">
                <span className={p.user_id === user.id ? "font-semibold" : ""}>
                  {p.display_name}
                  {p.user_id === user.id && <span className="text-xs text-slate-400"> (you)</span>}
                </span>
                {detail.status === "awaiting" && (
                  <span className={p.approved ? "text-green-700" : "text-slate-400"}>
                    {p.approved ? "✓ approved" : "… waiting"}
                  </span>
                )}
                {detail.status === "settled" && detail.proposed_winner_id === p.user_id && (
                  <span className="font-semibold text-green-700">🏆 winner</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ---- settlement: participants ------------------------------------ */}
      {isParticipant && (detail.status === "open" || detail.status === "awaiting") && (
        <Card>
          <SectionTitle>Settle it</SectionTitle>
          <form action={propose} className="flex flex-wrap items-end gap-3">
            <Field label={detail.status === "awaiting" ? "Change proposed winner" : "Who won?"}>
              <select name="winner_id" required className={inputClass} defaultValue={detail.proposed_winner_id ?? ""}>
                <option value="" disabled>Pick…</option>
                {detail.participants.map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.display_name}</option>
                ))}
              </select>
            </Field>
            <SubmitButton>{detail.status === "awaiting" ? "Update proposal" : "Propose winner"}</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Proposing resets everyone&rsquo;s approval. The bet settles when every participant approves.
          </p>
        </Card>
      )}

      {isParticipant && detail.status === "awaiting" && !me?.approved && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold">
            {winnerName} was proposed as the winner. Agree?
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <form action={approve}><SubmitButton>✓ Yes, they won</SubmitButton></form>
            <form action={dispute}><DangerButton>That&rsquo;s not right</DangerButton></form>
          </div>
        </Card>
      )}

      {isParticipant && detail.status === "awaiting" && me?.approved && (
        <Card>
          <p className="text-sm text-slate-600">
            You approved{winnerName ? ` ${winnerName}` : ""}. Waiting on{" "}
            {detail.participants.filter((p) => !p.approved).length} more.
          </p>
          <form action={dispute} className="mt-3">
            <DangerButton>Actually, dispute this</DangerButton>
          </form>
        </Card>
      )}

      {detail.status === "disputed" && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">This bet is disputed.</p>
          <p className="mt-1 text-sm text-red-700">
            {isAdmin
              ? "As admin, pick the winner below to resolve it."
              : "A group admin will sort it out."}
          </p>
          {isAdmin && (
            <form action={resolveDispute} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Winner">
                <select name="winner_id" required className={inputClass} defaultValue="">
                  <option value="" disabled>Pick…</option>
                  {detail.participants.map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.display_name}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton>Resolve</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {detail.status === "settled" && winnerName && (
        <Card className="border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-800">
            🏆 {winnerName} takes {detail.points} points.
          </p>
        </Card>
      )}

      {/* ---- admin tools -------------------------------------------------- */}
      {isAdmin && (detail.status === "open" || detail.status === "awaiting") && (
        <Card>
          <SectionTitle>Admin</SectionTitle>
          <div className="flex flex-wrap items-end gap-4">
            <form action={forceSettle} className="flex flex-wrap items-end gap-3">
              <Field label="Force winner">
                <select name="winner_id" required className={inputClass} defaultValue="">
                  <option value="" disabled>Pick…</option>
                  {detail.participants.map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.display_name}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton>Force settle</SubmitButton>
            </form>
            <form action={voidBet}>
              <DangerButton>Void bet</DangerButton>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
