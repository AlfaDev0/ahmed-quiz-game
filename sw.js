const CACHE_NAME = 'ahmed-quiz-v7';
const urlsToCache = [
    '/',
    '/index.html',
    '/questions.js',
    '/icons/avatar.jpg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                const requests = urlsToCache.map(u => fetch(u).then(r => r.ok ? cache.put(u, r) : null));
                return Promise.allSettled(requests);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
        event.respondWith(
            caches.match('/index.html').then(cached => {
                const network = fetch(event.request).then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put('/index.html', copy));
                    }
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});