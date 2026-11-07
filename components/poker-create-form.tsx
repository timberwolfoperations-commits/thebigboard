"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPokerTable } from "@/lib/poker-actions";
import { Field, inputClass } from "@/components/ui";

// One field, one tap: the name is pre-filled and every rule (100
// chips, the whole group seated, Mon/Wed/Fri deals, the clock) is a
// default the server already holds. If the group has more than ten
// members the server seats the first ten — that lands here as a plain
// note with the way in, not a silent surprise.
export default function PokerCreateForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [name, setName] = useState("Poker Night");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cappedTableId, setCappedTableId] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await createPokerTable(groupId, name);
      if (res.capped) {
        setCappedTableId(res.tableId);
        setPending(false);
      } else {
        router.push(`/groups/${groupId}/poker/${res.tableId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the table — try again.");
      setPending(false);
    }
  }

  if (cappedTableId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Table&rsquo;s dealt. One thing to know: this group has more than ten members, so the
          first ten were seated — a table holds ten, max. Everyone else can still watch the
          hand play out from the table page.
        </p>
        <Link
          href={`/groups/${groupId}/poker/${cappedTableId}`}
          className="inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Go to the table
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Table name">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          maxLength={60}
        />
      </Field>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Dealing…" : "Start the table"}
      </button>
    </form>
  );
}
