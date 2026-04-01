const CACHE_NAME = "pulseward-landing-v2";
const OFFLINE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener("message", (event) => {
  const payload = event.data || {};
  if (payload.type !== "SHOW_NOTIFICATION") {
    return;
  }

  self.registration.showNotification(payload.title || "PulseWard Notification", {
    body: payload.body || "You have a new update.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    data: {
      url: "./index.html#data-lab",
    },
  });
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { title: "PulseWard Notification", body: "Push event received" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "PulseWard Notification", {
      body: payload.body || "You have a new update.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      data: {
        url: payload.url || "./index.html#data-lab",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "./index.html";

  event.waitUntil(self.clients.openWindow(targetUrl));
});
