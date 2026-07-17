// Service Worker del panel admin (admin.html).
// Alcance restringido a "admin.html" (ver el scope pasado en el
// navigator.serviceWorker.register de admin.js) para instalarse como app
// separada de la tienda pública, que registra su propio Service Worker
// (sw-store.js) con alcance "index.html".
const CACHE_NAME = 'as-admin-shell-v1';
const APP_SHELL = [
  'admin.html',
  'admin.css',
  'admin.js',
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

// Solo se cachea el "cascarón" del panel para poder abrirlo sin conexión.
// Productos, pedidos, configuración, etc. siempre van a la red (Supabase) —
// no se cachean, para no mostrar nunca datos desactualizados.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match('admin.html'))
  );
});
