"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinPokerTable, startPokerTable } from "@/lib/poker-actions";

// The lobby's words on the table page: "I'm in" for a group member who
// hasn't taken a seat yet, "Deal the first hand" for the creator once
// at least two are in, and a waiting line for everyone else. The server
// actions re-check everything (lobby, membership, seat, cap, creator)
// — this component only collects taps.
export default function PokerLobbyActions({
  tableId,
  isCreator,
  isSeated,
  seatedCount,
  creatorName,
}: {
  tableId: string;
  isCreator: boolean;
  isSeated: boolean;
  seatedCount: number;
  creatorName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"join" | "start" | null>(null);
  const [error, setError] = useState("");

  async function go(kind: "join" | "start") {
    setPending(kind);
    setError("");
    try {
      if (kind === "join") await joinPokerTable(tableId);
      else await startPokerTable(tableId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through — try again.");
      setPending(null);
    }
  }

  const canStart = seatedCount >= 2;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!isSeated && (
        <>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => go("join")}
            className="w-full rounded-[10px] border border-accent bg-accent px-4 py-3 font-display text-lg font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === "join" ? "Taking your seat…" : "I'm in"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            100 chips, up to ten at the table. No seat, no clock, no pushes — until
            you&rsquo;re in, you just watch from the rail.
          </p>
        </>
      )}
      {isSeated && isCreator && (
        <>
          <button
            type="button"
            disabled={!canStart || pending !== null}
            onClick={() => go("start")}
            className="w-full rounded-[10px] border border-accent bg-accent px-4 py-3 font-display text-lg font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === "start" ? "Dealing…" : "Deal the first hand"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {canStart
              ? "Two or more in — deal whenever you're ready. The first hand starts everyone's 8-hour clock."
              : "Need at least one more player before the first hand can be dealt."}
          </p>
        </>
      )}
      {isSeated && !isCreator && (
        <p className="text-sm text-slate-600">
          You&rsquo;re in. Waiting for{" "}
          <span className="font-semibold text-slate-900">{creatorName}</span> to deal the
          first hand{canStart ? "." : " — one more player still needed."}
        </p>
      )}
    </div>
  );
}
