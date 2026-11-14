"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setGroupMemberRole } from "@/lib/actions";

// One-tap promote/demote on the group page's leaderboard, rendered only
// for the site commissioner (the page gates it). The server action
// re-checks that — group admins can never mint other admins — and
// refuses self-changes. This is the revoke valve for the group-admin
// test: demote and the admin's powers in this group are gone.
export default function GroupMemberRoleButton({
  groupId,
  userId,
  role,
}: {
  groupId: string;
  userId: string;
  role: "admin" | "member";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function go(next: "admin" | "member") {
    setPending(true);
    setError("");
    try {
      await setGroupMemberRole(groupId, userId, next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through — try again.");
      setPending(false);
    }
  }

  return (
    <span className="shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => go(role === "admin" ? "member" : "admin")}
        className="text-[10px] font-bold uppercase tracking-wide text-slate-400 underline underline-offset-2 hover:text-slate-600 disabled:opacity-40"
      >
        {pending ? "Saving…" : role === "admin" ? "Remove admin" : "Make admin"}
      </button>
      {error && <span className="ml-1 text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
