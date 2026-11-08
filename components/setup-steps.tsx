"use client";

import { useEffect, useState } from "react";
import { isAndroidDevice, isIosBrowserTab, isIosDevice, isStandalone } from "@/lib/push-detect";

// The instruction list on /setup, adapted to the device that's
// actually reading it (detection shared with the Profile toggle via
// lib/push-detect):
//
//   ios-tab     — iPhone in a Safari tab: the full install dance
//   in-app      — already opened from the Home Screen icon (iOS or
//                 Android): the hard part's done, just flip it on
//   android-tab — Chrome on Android: same dance, Chrome's menu names
//   desktop     — a computer: send yourself to your phone (desktop
//                 Chrome/Edge can also just switch it on below)
//
// The last step is always the switch itself — it lives right under
// this list on the page (the Profile PushToggle), so nobody has to
// go find it.

type Context = "loading" | "ios-tab" | "in-app" | "android-tab" | "desktop";

interface Step {
  title: string;
  body: string;
}

const FINISH_STEP: Step = {
  title: "Flip it on below",
  body: "Profile → Notifications → Turn on notifications, then Allow when your phone asks. It should say “On for this device” — and there's a Send test notification button right there to prove it landed.",
};

const STEPS: Record<Exclude<Context, "loading">, Step[]> = {
  "ios-tab": [
    {
      title: "Start in Safari",
      body: "On iPhone, only Safari can do the next step — if you're reading this in another app or browser, open thebigboard15.vercel.app in Safari first. (You're in Safari now, so you're good.)",
    },
    {
      title: "Share → Add to Home Screen → Add",
      body: "Tap the Share button (the square with the arrow pointing up), scroll down, and tap Add to Home Screen, then Add.",
    },
    {
      title: "Open Big Board from the Home Screen icon",
      body: "This is the step that matters: close Safari and open The Big Board from the new icon. Setup only sticks from the icon — do it inside Safari and it quietly won't work.",
    },
    FINISH_STEP,
  ],
  "in-app": [
    {
      title: "You're already in the app",
      body: "You opened Big Board from the Home Screen icon, so the hard part's done — notifications can actually reach this device.",
    },
    FINISH_STEP,
  ],
  "android-tab": [
    {
      title: "Chrome menu → Add to Home screen",
      body: "Tap the ⋮ menu in Chrome, then Add to Home screen, then Add.",
    },
    {
      title: "Open Big Board from the Home Screen icon",
      body: "Close Chrome and open The Big Board from the new icon — setup sticks best from there.",
    },
    FINISH_STEP,
  ],
  desktop: [
    {
      title: "Grab your phone",
      body: "The buzz matters on your phone, not at a desk. On iPhone: open thebigboard15.vercel.app in Safari → Share → Add to Home Screen → open it from the icon. On Android: open it in Chrome → ⋮ menu → Add to Home screen → open it from the icon.",
    },
    {
      title: "Flip it on — there, or right here",
      body: "On your phone it's Profile → Notifications → Turn on → Allow. On this computer, the switch below works too (Chrome/Edge) — you'll just get buzzed at your desk as well.",
    },
  ],
};

export default function SetupSteps() {
  const [context, setContext] = useState<Context>("loading");

  useEffect(() => {
    if (isIosBrowserTab()) return setContext("ios-tab");
    if ((isIosDevice() || isAndroidDevice()) && isStandalone()) return setContext("in-app");
    if (isAndroidDevice()) return setContext("android-tab");
    return setContext("desktop");
  }, []);

  if (context === "loading") {
    return <p className="text-sm text-slate-500">Checking this device…</p>;
  }

  return (
    <ol className="space-y-4">
      {STEPS[context].map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-display text-base font-bold text-white"
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">{step.title}</span>
            <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">
              {step.body}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
