"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGroup, joinGroup } from "@/lib/actions";
import { Field, inputClass, SubmitButton } from "@/components/ui";

// The header's hamburger: one menu holding everything that used to crowd the
// header and the dashboard top — group switching, new/join group, Scoring
// (commish only), profile, sign out.
export default function HeaderMenu({
  groups,
  displayName,
  isAdmin,
}: {
  groups: { id: string; name: string }[];
  displayName: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "new" | "join">("none");
  const router = useRouter();

  function close() {
    setOpen(false);
    setMode("none");
  }

  function pick(id: string | null) {
    close();
    router.push(id ? `/dashboard?group=${id}` : "/dashboard");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const itemClass =
    "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu"
        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
      >
        <span aria-hidden="true" className="flex flex-col items-center gap-1.5">
          <span className="block h-0.5 w-5 bg-slate-900" />
          <span className="block h-0.5 w-5 bg-slate-900" />
          <span className="block h-0.5 w-5 bg-slate-900" />
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={close}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Groups
            </p>
            <button type="button" onClick={() => pick(null)} className={itemClass}>
              All groups
            </button>
            {groups.map((g) => (
              <div key={g.id} className="flex items-center rounded-xl hover:bg-slate-100">
                <button
                  type="button"
                  onClick={() => pick(g.id)}
                  className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm font-semibold text-slate-600"
                >
                  {g.name}
                </button>
                <Link
                  href={`/groups/${g.id}`}
                  onClick={close}
                  className="shrink-0 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-900"
                >
                  Manage →
                </Link>
              </div>
            ))}

            <div className="my-1 border-t border-slate-100" />

            {mode === "none" && (
              <>
                <button type="button" onClick={() => setMode("new")} className={itemClass}>
                  + New group
                </button>
                <button type="button" onClick={() => setMode("join")} className={itemClass}>
                  Join with invite link
                </button>
              </>
            )}
            {mode === "new" && (
              <form action={createGroup} className="space-y-2 p-2">
                <Field label="Group name">
                  <input name="name" required placeholder="HS friends" className={inputClass} maxLength={60} />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton>Create</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setMode("none")}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {mode === "join" && (
              <form action={joinGroup} className="space-y-2 p-2">
                <Field label="Invite link or code">
                  <input name="token" required placeholder="Paste the invite link" className={inputClass} />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton>Join group</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setMode("none")}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="my-1 border-t border-slate-100" />

            {isAdmin && (
              <Link href="/scoring" onClick={close} className={itemClass}>
                Scoring
              </Link>
            )}
            <Link href="/profile" onClick={close} className={itemClass}>
              {displayName ?? "Profile"}
            </Link>
            <button type="button" onClick={signOut} className={itemClass}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
