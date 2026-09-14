const BASE = self.location.pathname.replace(/\/?sw\.js$/, '');
const CACHE_NAME = 'ahmed-quiz-v36';

const REL = {
    '/': '',
    '/index.html': '/index.html',
    '/questions.js': '/questions.js',
    '/study.js': '/study.js',
    '/icons/avatar.jpg': '/icons/avatar.jpg',
    '/icons/icon-192.png': '/icons/icon-192.png',
    '/icons/icon-512.png': '/icons/icon-512.png',
    '/manifest.json': '/manifest.json'
};
const urlsToCache = Object.values(REL).map(p => BASE + p);

const BIG_FILES = {
    [BASE + '/study.js']: { marker: '"books"', minSize: 1000000 },
    [BASE + '/questions.js']: { marker: 'window.QUESTIONS', minSize: 10000 }
};

function matchRule(rule, text) {
    if (!rule) return true;
    return text.length >= rule.minSize && text.indexOf(rule.marker) !== -1;
}

function putValidated(cache, url) {
    return fetch(url).then(r => {
        if (!r.ok) return false;
        const rule = BIG_FILES[url];
        if (!rule) return cache.put(url, r).then(() => true);
        return r.text().then(text => {
            if (!matchRule(rule, text)) return false;
            return cache.put(url, new Response(text, {
                headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
            })).then(() => true);
        });
    }).catch(() => false);
}

function cachedStudyOK() {
    return caches.open(CACHE_NAME).then(c => c.match(BASE + '/study.js')).then(res => {
        if (!res) return false;
        return res.text().then(t => matchRule(BIG_FILES[BASE + '/study.js'], t)).catch(() => false);
    }).catch(() => false);
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => urlsToCache.map(u => putValidated(cache, u)))
            .then(results => Promise.all(results))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        cachedStudyOK().then(ok => {
            if (!ok) return false;
            return caches.keys()
                .then(keys => Promise.all(
                    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
                ))
                .then(() => true);
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    if (url.pathname === BASE + '/' || url.pathname.endsWith('index.html')) {
        event.respondWith(
            caches.match(BASE + '/index.html').then(cached => {
                const network = fetch(event.request).then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(BASE + '/index.html', copy));
                    }
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        );
        return;
    }

    const bigRule = BIG_FILES[url.pathname];
    if (bigRule) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached && cached.ok) return cached;
                return fetch(event.request).then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, copy).catch(() => {}));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});