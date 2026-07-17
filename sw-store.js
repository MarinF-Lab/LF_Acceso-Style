// Service Worker de la tienda pública (index.html).
// Alcance restringido a "index.html" (ver el scope pasado en el
// navigator.serviceWorker.register de script.js) para no interferir con el
// panel admin, que registra su propio Service Worker (sw-admin.js) con
// alcance "admin.html" — ambos viven en la misma carpeta, así que el
// alcance angosto es lo que permite instalar las dos apps por separado.
const CACHE_NAME = 'acceso-style-shell-v1';
const APP_SHELL = [
  'index.html',
  'styles.css',
  'script.js',
  'content-fields.js',
  'categories.js',
  'supabase-config.js',
  'assets/logo-icon-cropped.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Solo se cachea el "cascarón" de la app para poder abrirla sin conexión.
// El catálogo, pedidos, login, etc. siempre van a la red (Supabase) — no se
// cachean, para no mostrar nunca datos desactualizados.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match('index.html'))
  );
});
