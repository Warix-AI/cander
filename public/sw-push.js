/* Cander Web Push service worker — closed-tab notifications. */
self.addEventListener("push", (event) => {
  let payload = { title: "Cander", body: "", data: {} };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  const title = payload.title || "Cander";
  const body = payload.body || "";
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: "/cander-orb.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const params = new URLSearchParams();
  if (data.connector) params.set("connector", data.connector);
  if (data.connectionId) params.set("connectionId", data.connectionId);
  if (data.resourceType) params.set("resourceType", data.resourceType);
  if (data.resourceId) params.set("resourceId", data.resourceId);
  if (data.messageId) params.set("messageId", data.messageId);
  if (data.threadId) params.set("threadId", data.threadId);
  const url = `/app?notify=1&${params.toString()}`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.postMessage({ type: "cander:notify", data });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
