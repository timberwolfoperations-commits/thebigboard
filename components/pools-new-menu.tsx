"use client";

import { useState } from "react";
import NewMenu from "@/components/new-menu";

// "+ New" for the Pools tab. Pool creation is group-scoped (every create
// route lives under /groups/[id]/…), and the Pools tab spans all groups —
// so this picks the group first, then hands off to the existing NewMenu
// for that group. No new creation flow is invented here.
export default function PoolsNewMenu({
  groups,
}: {
  groups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;
  if (groups.length === 1) return <NewMenu groupId={groups[0].id} />;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
      >
        + New
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              New pool in which group?
            </p>
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-slate-50"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-slate-700">
                  {g.name}
                </span>
                <NewMenu groupId={g.id} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
