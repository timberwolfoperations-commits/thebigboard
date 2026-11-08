// Client-side push context detection — the shared vocabulary for
// "where is this visitor, push-wise?" Used by the Profile toggle
// (components/push-toggle.tsx), the poker-table nudge, the dashboard
// setup banner, and the /setup instructions page, so every surface
// agrees on what state a device is in. Browser-only: call inside
// effects / event handlers, never during render on the server.

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

export function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroidDevice(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// iPhone/iPad in a browser TAB: web push doesn't exist there at all —
// it only exists once the site is on the Home Screen and opened from
// the icon. This is the state the setup flow exists to fix.
export function isIosBrowserTab(): boolean {
  return isIosDevice() && !isStandalone();
}
