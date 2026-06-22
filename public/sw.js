// Trust Security Scanner - Push Notification Service Worker

self.addEventListener("push", function (event) {
  if (!event.data) {
    console.warn("[Trust SW] Push event with no data");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Trust Security",
      body: event.data.text(),
    };
  }

  const title = payload.title || "Trust Security";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon.svg",
    badge: "/icon.svg",
    // Ensure notification is visible even on macOS
    requireInteraction: false,
    silent: false,
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // If a Trust tab is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            if (url !== "/") {
              client.navigate(url);
            }
            return;
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Activate immediately so new SW takes over without waiting for page reload
self.addEventListener("activate", function (event) {
  event.waitUntil(clients.claim());
});
