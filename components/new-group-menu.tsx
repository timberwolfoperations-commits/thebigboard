"use client";

import { useState } from "react";
import { createGroup, joinGroup } from "@/lib/actions";
import { Field, inputClass, SubmitButton } from "@/components/ui";

// "+ New" for the Groups tab: create a group or join with an invite
// link. Same server actions and form pieces as the header menu's
// new/join forms — this just gives them a home on mobile now that the
// hamburger is desktop-only.
export default function NewGroupMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "new" | "join">("none");

  function close() {
    setOpen(false);
    setMode("none");
  }

  const itemClass =
    "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100";

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
            onClick={close}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
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
                  <input
                    name="name"
                    required
                    placeholder="HS friends"
                    className={inputClass}
                    maxLength={60}
                  />
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
                  <input
                    name="token"
                    required
                    placeholder="Paste the invite link"
                    className={inputClass}
                  />
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
