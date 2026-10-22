"use client";

import { useState, type ReactNode } from "react";

// Expandable list card for the Pools / Groups tabs: the header is always
// visible; the body opens where it sits on tap, mirroring the dashboard's
// HappeningPoolCard accordion. The header node is rendered by the server
// (it may contain a Link into the full page); the chevron is the toggle,
// so links inside the header never nest inside a button.

export default function ExpandableCard({
  header,
  sub,
  children,
  defaultOpen = false,
}: {
  header: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-slate-100"
        >
          <span
            aria-hidden="true"
            className={`text-base text-slate-400 transition-transform duration-200 ${
              open ? "rotate-180 text-orange-700" : ""
            }`}
          >
            ▾
          </span>
        </button>
      </div>
      {sub && <div className="mt-1">{sub}</div>}
      {open && <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}
