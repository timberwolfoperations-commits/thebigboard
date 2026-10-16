"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createGroup, joinGroup } from "@/lib/actions";
import { Field, inputClass, SubmitButton } from "@/components/ui";

// The dashboard's group switcher: filters the pool list by group ("All
// groups" by default), links through to each group page for management,
// and houses the create/join forms that used to live on the dashboard.
export default function DashboardGroupMenu({
  groups,
  active,
}: {
  groups: { id: string; name: string }[];
  active: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "new" | "join">("none");
  const router = useRouter();

  const label = active
    ? (groups.find((g) => g.id === active)?.name ?? "All groups")
    : "All groups";

  function pick(id: string | null) {
    setOpen(false);
    setMode("none");
    router.push(id ? `/dashboard?group=${id}` : "/dashboard");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
      >
        <span className="max-w-44 truncate">{label}</span>
        <span aria-hidden="true" className="text-xs text-slate-500">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
              setMode("none");
            }}
          />
          <div
            role="menu"
            className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            <button
              type="button"
              onClick={() => pick(null)}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-100 ${
                !active ? "text-slate-900" : "text-slate-600"
              }`}
            >
              All groups
            </button>
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center rounded-xl hover:bg-slate-100"
              >
                <button
                  type="button"
                  onClick={() => pick(g.id)}
                  className={`min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm font-semibold ${
                    active === g.id ? "text-slate-900" : "text-slate-600"
                  }`}
                >
                  {g.name}
                </button>
                <Link
                  href={`/groups/${g.id}`}
                  onClick={() => setOpen(false)}
                  className="shrink-0 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-900"
                >
                  Manage →
                </Link>
              </div>
            ))}

            <div className="my-1 border-t border-slate-100" />

            {mode === "none" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  + New group
                </button>
                <button
                  type="button"
                  onClick={() => setMode("join")}
                  className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
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
          </div>
        </>
      )}
    </div>
  );
}
