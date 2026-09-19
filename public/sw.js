/* Service Worker — Northerapy CRM
 * Estrategias:
 *  · Navegación: red primero → caché → /offline.html
 *  · Estáticos del build e íconos: caché primero + refresco en segundo plano
 *  · Supabase (/rest, /auth) y /api: nunca se interceptan (siempre red)
 */
const VERSION = "northerapy-v1";
const PRECACHE = ["/offline.html"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y otros dominios: directo
  if (url.pathname.startsWith("/_next/webpack-hmr")) return; // HMR de desarrollo
  if (url.pathname.startsWith("/api/")) return; // APIs: siempre red

  // Navegación: red primero con respaldo
  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches
            .open(VERSION)
            .then((cache) => cache.put(req, copia))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((enCache) => enCache || caches.match("/offline.html"))
        )
    );
    return;
  }

  // Estáticos: caché primero + actualización en segundo plano
  const esEstatico =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|svg|webp|ico|woff2?)$/.test(url.pathname);
  if (esEstatico) {
    evento.respondWith(
      caches.match(req).then((enCache) => {
        const desdeRed = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches
                .open(VERSION)
                .then((cache) => cache.put(req, copia))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => enCache);
        return enCache || desdeRed;
      })
    );
  }
});
