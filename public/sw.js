/* NUSALA 26 service worker */
const CACHE = "nusala26-v4";
const SHELL = ["/", "/style.css", "/app.js", "/data.json", "/assets/logo-nusala.png", "/assets/hero-palms.png", "/assets/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* ponytail: network-first everywhere — cache is the offline fallback, never the source of truth.
   Cache-first would strand installed phones on old HTML/JS until someone bumped CACHE. */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
  );
});

/* ponytail: payload-less push — fetch latest announcement for the notification body */
self.addEventListener("push", (e) => {
  e.waitUntil(
    fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const a = (d.announcements || [])[0];
        return self.registration.showNotification("NUSALA 26", {
          body: a ? a.text : "Schedule updated — tap to view",
          icon: "/assets/icon-192.png",
          badge: "/assets/icon-192.png",
        });
      })
      .catch(() =>
        self.registration.showNotification("NUSALA 26", { body: "Update from the convention — tap to view", icon: "/assets/icon-192.png" })
      )
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("/");
    })
  );
});
