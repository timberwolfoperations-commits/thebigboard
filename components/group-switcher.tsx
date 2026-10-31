"use client";

import { useState } from "react";
import Link from "next/link";
import NewGroupMenu from "@/components/new-group-menu";
import type { MyGroup } from "@/lib/my-pools";

// The group switcher: same pattern as the pool switcher — the group
// page opens onto the group itself, and the other groups are a sheet
// away. Creating or joining a group lives at the bottom of the sheet.
export default function GroupSwitcher({
  groups,
  currentId,
  memberCount,
}: {
  groups: MyGroup[];
  currentId: string;
  memberCount: number;
}) {
  const [open, setOpen] = useState(false);
  const current = groups.find((g) => g.id === currentId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
          {current?.name ?? "Group"}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0 text-slate-400"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="ml-auto shrink-0 text-sm text-slate-500">
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close switcher"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 right-0 z-20 mt-3 max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg sm:right-auto sm:w-96"
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your groups
            </p>
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                <span className="font-semibold text-slate-800">{g.name}</span>
                {g.id === currentId && (
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-orange-700">
                    Current
                  </span>
                )}
              </Link>
            ))}
            <div className="mt-1 border-t border-slate-100 px-1 pb-1 pt-2">
              <NewGroupMenu />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
