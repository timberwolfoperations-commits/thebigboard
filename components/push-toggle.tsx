"use client";

import { useEffect, useState } from "react";
import { saveSubscription, removeSubscription } from "@/lib/push-actions";

// The notifications switch on /profile. Web push is a per-device,
// per-browser thing, so this component's whole job is figuring out
// which state THIS device is in and showing the honest version of it:
//
//   unconfigured — the VAPID keys aren't live yet; the feature is off
//   ios-install  — iPhone Safari tab: push only exists once the site
//                  is on the Home Screen, so explain that instead of
//                  showing a switch that can't work
//   unsupported  — this browser has no PushManager at all
//   denied       — the player blocked notifications in the browser
//   off / on     — this device's subscription state, read from the
//                  browser itself (PushManager), never guessed
//
// Subscriptions are written through lib/push-actions (session client,
// owner-only RLS); the service worker is push-only (public/sw.js).

type Status =
  | "loading"
  | "unconfigured"
  | "ios-install"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent;
  if (!/iphone|ipad|ipod/i.test(ua)) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export default function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!publicKey) return setStatus("unconfigured");
      if (isIosBrowserTab()) return setStatus("ios-install");
      if (!pushSupported()) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (live) setStatus(sub ? "on" : "off");
      } catch {
        if (live) setStatus("unsupported");
      }
    })();
    return () => {
      live = false;
    };
  }, [publicKey]);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const result = await saveSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        userAgent: navigator.userAgent,
      });
      if (!result.ok) throw new Error("save failed");
      setStatus("on");
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  const onButton =
    "rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";
  const offButton =
    "rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";

  return (
    <div className="mt-2">
      {status === "loading" && <p className="text-sm text-slate-500">Checking this device…</p>}

      {status === "unconfigured" && (
        <p className="text-sm text-slate-500">
          Notifications aren&rsquo;t switched on for The Big Board yet — check back soon.
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-sm text-slate-500">
          This browser doesn&rsquo;t support push notifications. Try Chrome, Edge, Firefox, or
          Safari on a device where The Big Board is installed.
        </p>
      )}

      {status === "ios-install" && (
        <p className="text-sm leading-relaxed text-slate-500">
          On iPhone, notifications work once The Big Board is on your Home Screen: Share → Add
          to Home Screen, then open it from there and flip this on.
        </p>
      )}

      {status === "denied" && (
        <p className="text-sm leading-relaxed text-slate-500">
          Notifications are blocked for this site in your browser&rsquo;s settings. Allow them
          there, then come back and flip this on.
        </p>
      )}

      {status === "off" && (
        <>
          <p className="text-sm leading-relaxed text-slate-500">
            Get tapped on the shoulder when it&rsquo;s your move at the poker table — no more
            checking the app to see whose clock is running.
          </p>
          <div className="mt-3">
            <button type="button" onClick={turnOn} disabled={busy} className={onButton}>
              {busy ? "Working…" : "Turn on notifications"}
            </button>
          </div>
        </>
      )}

      {status === "on" && (
        <>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">On for this device.</span> You&rsquo;ll
            get a push when the poker clock lands on you.
          </p>
          <div className="mt-3">
            <button type="button" onClick={turnOff} disabled={busy} className={offButton}>
              {busy ? "Working…" : "Turn off"}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
