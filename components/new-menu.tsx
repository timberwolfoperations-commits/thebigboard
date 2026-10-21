"use client";

import { useState } from "react";
import Link from "next/link";

// One "+ New" button replacing the old "+ New bet / + New pool / + Pick'em"
// pill row, which overflowed the phone screen and confused "pool" vs
// "pick'em" (a pick'em IS a pool). Tapping opens a small menu with one-line
// descriptions so the choice is obvious. The invite-link button stays
// separate — sharing isn't creating.
export default function NewMenu({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);

  const items = [
    {
      href: `/groups/${groupId}/bets/new`,
      title: "Bet",
      desc: "Head-to-head or group bet",
    },
    {
      href: `/groups/${groupId}/pools/new`,
      title: "Roster pool",
      desc: "Draft players, top score wins",
    },
    {
      href: `/groups/${groupId}/pickem/new`,
      title: "Pick'em pool",
      desc: "Pick winners or over/under props",
    },
    {
      href: `/groups/${groupId}/survivor/new`,
      title: "Survivor pool",
      desc: "One pick a week — lose and you're out",
    },
  ];

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
            className="absolute left-1/2 z-20 mt-2 w-60 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 hover:bg-slate-100"
              >
                <span className="block text-sm font-bold text-slate-900">
                  {it.title}
                </span>
                <span className="block text-xs text-slate-500">{it.desc}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
