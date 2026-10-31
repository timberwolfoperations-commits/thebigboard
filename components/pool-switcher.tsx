"use client";

import { useState } from "react";
import Link from "next/link";
import type { MyGroup, MyPool } from "@/lib/my-pools";

// The pool switcher: on detail-first pool pages, the pool's name IS the
// header — tap it and the rest of your pools are a sheet away, not a
// list page. "+ New pool" lives at the bottom of the sheet and nowhere
// else: commissioners find it in two taps, players never carry it.
// (Michael, 2026-10-30: "No one wants to be the organizer" — creation
// is demoted for players, loud only for users with zero pools.)

const POOL_TYPES = [
  { suffix: "pickem/new", label: "Pick'em" },
  { suffix: "survivor/new", label: "Survivor" },
  { suffix: "quiz/new", label: "Quiz — The Hot Seat" },
  { suffix: "pools/new", label: "Roster pool" },
];

export default function PoolSwitcher({
  pools,
  groups,
  currentKey,
  currentName,
  currentGroupName,
}: {
  pools: MyPool[];
  groups: MyGroup[];
  currentKey: string;
  // Fallback label for a pool the viewer hasn't entered (e.g. an open
  // pool they're viewing in order to join) — it isn't in their list.
  currentName?: string;
  currentGroupName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"pools" | "groups" | "types">("pools");
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const current = pools.find((p) => p.key === currentKey);

  function close() {
    setOpen(false);
    setView("pools");
    setNewGroupId(null);
  }

  function startNew() {
    if (groups.length === 1) {
      setNewGroupId(groups[0].id);
      setView("types");
    } else {
      setView("groups");
    }
  }

  const rowClass =
    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="font-display text-3xl font-bold uppercase leading-none tracking-wide">
          {current?.name ?? currentName ?? "Pools"}
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
        {(current?.groupName ?? currentGroupName) && (
          <span className="ml-auto shrink-0 text-sm text-slate-500">
            {current?.groupName ?? currentGroupName}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close switcher"
            className="fixed inset-0 z-10 cursor-default"
            onClick={close}
          />
          <div
            role="menu"
            className="absolute left-0 right-0 z-20 mt-3 max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg sm:right-auto sm:w-96"
          >
            {view === "pools" && (
              <>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Your pools
                </p>
                {pools.map((p) => (
                  <Link key={p.key} href={p.href} className={rowClass} onClick={close}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{p.name}</span>
                      <span className="block text-xs text-slate-500">{p.statusText}</span>
                    </span>
                    {p.key === currentKey && (
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-orange-700">
                        Current
                      </span>
                    )}
                  </Link>
                ))}
                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button type="button" className={rowClass} onClick={startNew}>
                    <span className="font-semibold text-slate-500">+ New pool</span>
                  </button>
                </div>
              </>
            )}

            {view === "groups" && (
              <>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  New pool in which group?
                </p>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={rowClass}
                    onClick={() => {
                      setNewGroupId(g.id);
                      setView("types");
                    }}
                  >
                    <span className="font-semibold text-slate-800">{g.name}</span>
                  </button>
                ))}
                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button type="button" className={rowClass} onClick={() => setView("pools")}>
                    <span className="font-semibold text-slate-500">← Back</span>
                  </button>
                </div>
              </>
            )}

            {view === "types" && newGroupId && (
              <>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  New pool in {groups.find((g) => g.id === newGroupId)?.name ?? "group"}
                </p>
                {POOL_TYPES.map((t) => (
                  <Link
                    key={t.suffix}
                    href={`/groups/${newGroupId}/${t.suffix}`}
                    className={rowClass}
                    onClick={close}
                  >
                    <span className="font-semibold text-slate-800">{t.label}</span>
                  </Link>
                ))}
                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => setView(groups.length === 1 ? "pools" : "groups")}
                  >
                    <span className="font-semibold text-slate-500">← Back</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
