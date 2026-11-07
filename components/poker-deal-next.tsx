"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dealNextHand } from "@/lib/poker-actions";

// The creator's deal-next-hand button, inside the table page's
// "Coming up" card between hands. The server action re-checks
// everything (creator, running table, no live hand) — this component
// only collects the tap. The deal it triggers is the sweep's own, so
// an early hand is dealt, timed and announced exactly like a
// scheduled one.
export default function PokerDealNext({
  tableId,
  nextHandNo,
}: {
  tableId: string;
  nextHandNo: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setPending(true);
    setError("");
    try {
      await dealNextHand(tableId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through — try again.");
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={go}
        className="w-full rounded-[10px] border border-accent bg-accent px-4 py-3 font-display text-lg font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Dealing…" : `Deal hand ${nextHandNo} now`}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        You&rsquo;re running this table — skip the wait and deal the next hand early. It
        starts everyone&rsquo;s 8-hour first clock, and the regular schedule stays lined up
        behind it.
      </p>
    </div>
  );
}
