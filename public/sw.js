// Lets the installed app open and play offline.
// Pages are network-first (fresh leaderboard when online), built assets are cache-first (their names are hashed).
// Built files live in /build/assets/ (Laravel) or /assets/ (the Vercel site).
const CACHE = 'snake-v2';
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(precache());
    self.skipWaiting();
});

// Cache the page plus the built CSS, JS and fonts it links to, so the very first install already works offline.
async function precache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    const html = await (await cache.match('/')).text();
    const assets = [...new Set(html.match(/\/(?:build\/)?assets\/[^"'\s)]+/g) ?? [])];
    await cache.addAll(assets);
}

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === 'navigate' && url.pathname === '/') {
        event.respondWith(networkFirst(request));
    } else if (/^\/(build\/)?assets\/|^\/icons\//.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put('/', response.clone());
        }
        return response;
    } catch {
        return (await cache.match('/')) ?? Response.error();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) {
        return cached;
    }
    const response = await fetch(request);
    if (response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}
