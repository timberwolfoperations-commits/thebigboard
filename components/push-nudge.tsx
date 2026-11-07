"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// One slim line on the poker table page for a viewer whose CURRENT
// device has no push subscription: "Get pinged when it's your turn —
// turn on notifications" → /profile, where the actual switch lives.
// Self-detecting and silent in every other case — feature not
// configured, push unsupported here (an iPhone browser tab, where the
// profile page carries the Home Screen explanation instead),
// permission denied, or already subscribed on this device. No modals,
// no repeats, no nagging.

export default function PushNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (!("Notification" in window) || Notification.permission === "denied") return;
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (live && !sub) setShow(true);
      } catch {
        // No service worker, no nudge — stay invisible.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!show) return null;
  return (
    <p className="text-center text-sm text-slate-500">
      Get pinged when it&rsquo;s your turn —{" "}
      <Link
        href="/profile"
        className="font-semibold text-slate-700 underline-offset-4 hover:underline"
      >
        turn on notifications
      </Link>
    </p>
  );
}
