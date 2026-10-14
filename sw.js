/* App Launcher service worker — precaches the shell for offline use.
 * apps.json is deliberately NOT precached: it's fetched network-first so
 * the dashboard picks up new apps the moment you're online.
 */
"use strict";

const CACHE_VERSION = "app-launcher-v1";
const PRECACHE = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The app list: network first (so it stays fresh), cache as offline fallback.
  if (url.pathname.endsWith("/apps.json")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return (
            cached ||
            new Response("Offline and no cached app list.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  // Everything else: cache first (precached shell), network on miss.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        return new Response("Offline and not cached.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })()
  );
});
