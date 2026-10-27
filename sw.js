/* Image Makers · Service Worker — offline λειτουργία & ειδοποιήσεις push */
const CACHE = 'im-v6';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/core.js', 'js/data.js', 'js/layout.js', 'js/components.js', 'js/push.js', 'js/offer.js', 'js/grid.js', 'js/backup.js', 'js/charts.js',
  'js/views/auth.js', 'js/views/home.js', 'js/views/calendar.js', 'js/views/events.js', 'js/views/event-form.js',
  'js/views/customers.js', 'js/views/money.js', 'js/views/sheets.js', 'js/views/requests.js', 'js/views/appointments.js', 'js/views/workflow.js', 'js/views/outbox.js',
  'js/views/team.js', 'js/views/settings.js', 'js/views/help.js', 'js/views/notifications.js',
  'vendor/supabase.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-white.png', 'icons/hero.jpg',
  'icons/badge-96.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Πρώτα δίκτυο (για να έχετε πάντα την τελευταία έκδοση), αλλιώς από την προσωρινή μνήμη
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// ---------- Push ----------
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Image Makers', body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Image Makers';
  const opts = {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.id || undefined,
    data: { url: d.url || '#/notifications', id: d.id },
    vibrate: [80, 40, 80],
    timestamp: Date.now(),
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    try { if (d.badge && self.navigator && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(d.badge); } catch {}
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'push', payload: d }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#/notifications';
  const id = event.notification.data && event.notification.data.id;
  const target = new URL(self.registration.scope).href.replace(/#.*$/, '') + (hash.startsWith('#') ? hash : '#' + hash);
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        c.postMessage({ type: 'navigate', hash, id });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'resubscribe' }));
  })());
});
