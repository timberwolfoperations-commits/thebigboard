"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPokerTable } from "@/lib/poker-actions";
import { Field, inputClass } from "@/components/ui";

// One field, one tap: the name is pre-filled and every rule (100
// chips, Mon/Wed/Fri deals, the clock) is a default the server already
// holds. Creating opens the lobby with only the creator seated — the
// rest of the group taps "I'm in" on the table page, up to ten seats.
export default function PokerCreateForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [name, setName] = useState("Poker Night");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await createPokerTable(groupId, name);
      router.push(`/groups/${groupId}/poker/${res.tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the table — try again.");
      setPending(false);
    }
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
        {pending ? "Creating…" : "Create the table"}
      </button>
    </form>
  );
}
