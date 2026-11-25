const prefix = 'calc-qc-shell-';
const cacheName = prefix + '__CACHE_VERSION__';
const precache = __PRECACHE_FILES__;

self.addEventListener('install', event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(precache)));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName)
            .map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    if (event.request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname)) {
        event.respondWith(fetch(event.request).catch(async () => {
            const cache = await caches.open(cacheName);
            return cache.match('/index.html');
        }));
        return;
    }

    if (precache.includes(url.pathname)) {
        event.respondWith(caches.open(cacheName).then(async cache =>
            (await cache.match(url.pathname)) ?? fetch(event.request)));
    }
});
