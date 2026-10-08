self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("touchgrass-v1").then(cache =>
      cache.addAll(["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/icon.svg"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match("/index.html")))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "🌱 TouchGrass", {
      body: data.body || "There is a good reason to step outside.",
      tag: data.tag || "touchgrass",
      icon: "/icon.svg",
      badge: "/icon.svg",
      requireInteraction: false
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    if (list.length) return list[0].focus();
    return clients.openWindow("/");
  }));
});
