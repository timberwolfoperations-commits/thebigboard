"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { act, type PokerActionInput } from "@/lib/poker-actions";

// The decision panel inside the table page's prompt box. Everything it
// needs (what's owed, the legal raise range, the pot-raise size) is
// computed on the server from the public view and handed in as a model;
// this component only collects the tap and calls act(). The engine
// still validates every action server-side — a stale screen gets an
// honest error, never a bad write.

export interface PokerActionModel {
  handId: string;
  owed: number; // chips needed to call, already capped at the stack
  stack: number; // chips behind
  maxTo: number; // committedStreet + stack: the all-in total
  minRaiseTo: number;
  potRaiseTo: number | null; // null when a pot raise would just be the all-in
  canRaise: boolean;
  deadlineAt: string | null; // iso
  facingBet: boolean;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

const btnBase =
  "flex-1 rounded-[10px] border px-1 py-3 font-display text-lg font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40";

export default function PokerActions({ model }: { model: PokerActionModel }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(model.minRaiseTo);

  const allInCall = model.owed > 0 && model.owed >= model.stack;
  const stepperUsable = model.canRaise && model.minRaiseTo < model.maxTo;

  async function go(input: PokerActionInput) {
    setPending(true);
    setError("");
    try {
      await act(model.handId, input);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through — try again.");
      setPending(false);
    }
  }

  function clampRaise(n: number): number {
    if (!Number.isFinite(n)) return model.minRaiseTo;
    return Math.min(model.maxTo, Math.max(model.minRaiseTo, Math.floor(n)));
  }

  const deadlinePassed =
    model.deadlineAt !== null && new Date(model.deadlineAt).getTime() <= Date.now();

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {model.owed > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ type: "fold" })}
            className={`${btnBase} border-slate-900 bg-white text-slate-900 hover:bg-slate-100`}
          >
            Fold
          </button>
        )}
        {model.owed === 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ type: "check" })}
            className={`${btnBase} border-slate-900 bg-slate-900 text-[#f7f4ef] hover:bg-slate-700`}
          >
            Check
          </button>
        ) : allInCall ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ type: "allin" })}
            className={`${btnBase} border-slate-900 bg-slate-900 text-[#f7f4ef] hover:bg-slate-700`}
          >
            All-in {model.stack}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ type: "call" })}
            className={`${btnBase} border-slate-900 bg-slate-900 text-[#f7f4ef] hover:bg-slate-700`}
          >
            Call {model.owed}
          </button>
        )}
        {model.canRaise && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setRaiseOpen((o) => !o)}
            className={`${btnBase} border-accent bg-accent text-white hover:opacity-90`}
          >
            Raise
          </button>
        )}
      </div>

      {raiseOpen && model.canRaise && (
        <div className="mt-2">
          <div className="flex gap-2">
            {model.minRaiseTo < model.maxTo && (
              <button
                type="button"
                disabled={pending}
                onClick={() => go({ type: "raise", to: model.minRaiseTo })}
                className="flex-1 rounded-[10px] border border-dashed border-[#cfc8ba] bg-[#faf9f7] px-1 py-2 text-center text-xs text-slate-500 transition hover:border-slate-400 disabled:opacity-40"
              >
                Min raise
                <span className="block font-display text-base font-semibold text-slate-900">
                  to {model.minRaiseTo}
                </span>
              </button>
            )}
            {model.potRaiseTo !== null && model.potRaiseTo > model.minRaiseTo && (
              <button
                type="button"
                disabled={pending}
                onClick={() => go({ type: "raise", to: model.potRaiseTo! })}
                className="flex-1 rounded-[10px] border border-dashed border-[#cfc8ba] bg-[#faf9f7] px-1 py-2 text-center text-xs text-slate-500 transition hover:border-slate-400 disabled:opacity-40"
              >
                Pot
                <span className="block font-display text-base font-semibold text-slate-900">
                  to {model.potRaiseTo}
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => go({ type: "allin" })}
              className="flex-1 rounded-[10px] border border-dashed border-[#cfc8ba] bg-[#faf9f7] px-1 py-2 text-center text-xs text-slate-500 transition hover:border-slate-400 disabled:opacity-40"
            >
              All-in
              <span className="block font-display text-base font-semibold text-slate-900">
                {model.stack} chips
              </span>
            </button>
          </div>

          {stepperUsable && (
            <div className="mt-2 flex items-stretch gap-2">
              <button
                type="button"
                aria-label="Less"
                disabled={pending}
                onClick={() => setRaiseTo((v) => clampRaise(v - 1))}
                className="w-11 rounded-[10px] border border-slate-300 bg-white font-display text-xl font-semibold text-slate-700 disabled:opacity-40"
              >
                −
              </button>
              <label className="flex flex-1 items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3">
                <span className="text-xs font-medium text-slate-500">Raise to</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={model.minRaiseTo}
                  max={model.maxTo}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(clampRaise(Number(e.target.value)))}
                  className="w-full py-2.5 text-right font-display text-lg font-semibold tabular-nums outline-none"
                />
              </label>
              <button
                type="button"
                aria-label="More"
                disabled={pending}
                onClick={() => setRaiseTo((v) => clampRaise(v + 1))}
                className="w-11 rounded-[10px] border border-slate-300 bg-white font-display text-xl font-semibold text-slate-700 disabled:opacity-40"
              >
                +
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => go({ type: "raise", to: clampRaise(raiseTo) })}
                className="rounded-[10px] border border-accent bg-accent px-4 font-display text-lg font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Raise
              </button>
            </div>
          )}
        </div>
      )}

      {model.deadlineAt && (
        <p className="mt-3 text-center text-xs text-[#b6b0a2]">
          {deadlinePassed ? (
            <>
              The clock has run out — the sweep settles you as a{" "}
              <b className="font-bold text-accent">{model.facingBet ? "fold" : "check"}</b> any
              moment.
            </>
          ) : (
            <>
              No answer by <b className="font-bold text-accent">{fmtClock(model.deadlineAt)} ET</b>{" "}
              and you&rsquo;re{" "}
              {model.facingBet ? (
                <>folded — there&rsquo;s a bet in front of you.</>
              ) : (
                <>checked — no bet in front of you.</>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}
