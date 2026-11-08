"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isIosBrowserTab, pushSupported } from "@/lib/push-detect";

// The dashboard's setup strip: signed-in players whose CURRENT device
// isn't set up for push yet get one slim, tappable invitation to
// /setup. Self-detecting, same rules as the poker-table nudge —
// invisible when push isn't configured, unsupported here, or already
// subscribed on this device — plus two states of its own:
//
//   ios-tab — an iPhone browser tab counts as "not set up" even
//             though PushManager exists there: push only exists once
//             the site is on the Home Screen, so the banner shows.
//   denied  — permission is blocked; the fix lives in the phone's
//             settings, not a banner tap, so stay invisible (the
//             Profile toggle carries that explanation).
//
// Dismissal is per-device (localStorage), via the × — stored on tap,
// never re-asked on this device. While the check runs, render
// nothing: players who are already set up never see a flash of it.

const DISMISS_KEY = "bb-setup-banner-dismissed";

export default function SetupBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return;
      try {
        if (window.localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        // Storage blocked — treat as not dismissed.
      }
      if (isIosBrowserTab()) {
        if (live) setShow(true);
        return;
      }
      if (!pushSupported()) return;
      if (Notification.permission === "denied") return;
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (live && !sub) setShow(true);
      } catch {
        // No service worker, no banner — stay invisible.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage blocked — hide for this visit anyway.
    }
    setShow(false);
  }

  return (
    <div className="relative">
      <Link
        href="/setup"
        className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white transition hover:bg-slate-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 shrink-0 text-[#f97316]"
          aria-hidden="true"
        >
          <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        <span className="min-w-0 flex-1 pr-6 text-sm leading-snug">
          <span className="font-bold">Never miss your move.</span> Get Big Board on your
          Home Screen and get buzzed when the poker clock lands on you.{" "}
          <span className="font-bold text-[#f97316]">Set it up →</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-700 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
