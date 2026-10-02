const BASE = self.location.pathname.replace(/\/?sw\.js$/, '');
const CACHE_NAME = 'ahmed-quiz-v69';

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
    [BASE + '/questions.js']: { marker: '"QUESTIONS"', minSize: 10000 }
};

// v67: كل طلب نت له مهلة — لو الشبكة بطيئة/مقطوعة بنرجع للكاش فورًا بدل ما ننتظر
function netFetch(req, ms) {
    ms = ms || 6000;
    let ctl = null;
    try { if (typeof AbortController !== 'undefined') ctl = new AbortController(); } catch (e) { }
    const opt = ctl ? { signal: ctl.signal } : {};
    let timer = null;
    const guard = new Promise((_, rej) => {
        timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { } rej(new Error('timeout')); }, ms);
    });
    return Promise.race([fetch(req, opt), guard]).then(v => { clearTimeout(timer); return v; },
        e => { clearTimeout(timer); throw e; });
}

function matchRule(rule, text) {
    if (!rule) return true;
    return text.length >= rule.minSize && text.indexOf(rule.marker) !== -1;
}

function putValidated(cache, url) {
    return netFetch(url, 20000).then(r => {
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

    // index.html: تسليم فوري من الكاش + تحديث في الخلفية (زيرو انتظار على نت بطيء)
    if (url.pathname === BASE + '/' || url.pathname.endsWith('index.html')) {
        event.respondWith((async () => {
            const key = BASE + '/index.html';
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(key);
            const update = netFetch(event.request, 8000).then(res => {
                if (res && res.ok) return cache.put(key, res.clone()).catch(() => { });
            }).catch(() => { });
            if (cached) { event.waitUntil(update); return cached; }
            try {
                const res = await netFetch(event.request, 8000);
                if (res && res.ok) { cache.put(key, res.clone()); return res; }
            } catch (e) { }
            return new Response(
                '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;text-align:center;padding:50px;line-height:2">📴 مفيش نت<br>افتح اللعبة مرة واحدة وأنت متصل، وأول ما تشتغل هتشتغل معاك بدون نت.</body>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })());
        return;
    }

    const bigRule = BIG_FILES[url.pathname];
    if (bigRule) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached && cached.ok) return cached;
                return netFetch(event.request, 20000).then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, copy).catch(() => { }));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || netFetch(event.request))
    );
});