// The Big Board — push-only service worker.
//
// Deliberately NO fetch handler and NO caching: the app must never be
// served stale from a service worker (a picks page from an hour ago is
// worse than no page at all). This worker exists for exactly one job —
// receive a push, show the notification, and land the tap on the page
// the push was about.

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || "The Big Board";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/dashboard" },
  };
  if (data.icon) options.icon = data.icon;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse a tab already on the target page if there is one;
      // otherwise focus any Big Board tab and navigate it; otherwise
      // open fresh.
      for (const client of windowClients) {
        if (client.url.endsWith(target) && "focus" in client) {
          return client.focus();
        }
      }
      for (const client of windowClients) {
        if ("focus" in client && "navigate" in client) {
          await client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
