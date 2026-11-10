"use client";

import { useState } from "react";
import { updatePushPrefs } from "@/lib/push-actions";
import type { PushPrefs } from "@/lib/pool-push-logic";

// The category switches under the device toggle on /profile
// (migration 030). Two buckets, matching the restraint rule the
// senders enforce: "Needs me" pushes ask for your picks; "Results"
// pushes tell you how your pool ended. These gate CATEGORIES, not
// devices — the per-device subscription switch above stays the
// master on/off for this phone/browser.
//
// Saves on tap through lib/push-actions (session client, self-update
// RLS). If the save fails — say migration 030 hasn't run yet — the
// switch flips back and says so, rather than lying about the state.

function CategorySwitch({
  label,
  blurb,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  blurb: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{blurb}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          on ? "bg-slate-900" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
            on ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function PushPrefsToggles({ initial }: { initial: PushPrefs }) {
  const [prefs, setPrefs] = useState<PushPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(key: keyof PushPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setFailed(false);
    const res = await updatePushPrefs(next);
    setSaving(false);
    if (!res.ok) {
      setPrefs(prefs); // flip back — the save didn't stick
      setFailed(true);
    }
  }

  return (
    <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
      <CategorySwitch
        label="Needs me"
        blurb="Picks are open, or yours aren't in yet."
        on={prefs.needsYou}
        disabled={saving}
        onToggle={() => void toggle("needsYou")}
      />
      <CategorySwitch
        label="Results"
        blurb="A pool ends — your record, your win if you got one."
        on={prefs.results}
        disabled={saving}
        onToggle={() => void toggle("results")}
      />
      {failed && (
        <p className="py-2 text-xs text-red-500">
          That didn&apos;t save — try again in a bit.
        </p>
      )}
    </div>
  );
}
