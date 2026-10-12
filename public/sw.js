// BuildTrack service worker: keeps the app itself (not the data) available when the signal drops, and lets a new version wait
// until the person chooses to reload. Data requests (Supabase, other origins) are never cached here; saved work is kept by the
// app's offline queue (IndexedDB) and sent when the connection is back.
const VERSION = "buildtrack-v1"
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase and every other origin go straight to the network

  // Page loads: the network first (so a new version is picked up), the saved app shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put("/", copy))
          return response
        })
        .catch(async () => (await caches.match("/")) || new Response("BuildTrack is offline. Open it again when you have a connection.", { status: 503, headers: { "Content-Type": "text/plain" } })),
    )
    return
  }

  // Built files have a hash in their name and never change: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(VERSION).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // Icons, manifest and other small files: show the saved copy at once and refresh it in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit)
      return hit || refresh
    }),
  )
})
