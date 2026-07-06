/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `app-${version}`;

const ASSETS = [
	...build,       // app JS/CSS bundles
	...files        // static files (manifest, icons, fonts)
];

// Precache everything on install.
self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
	self.skipWaiting();
});

// Activate: delete old caches and claim clients.
self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}
	event.waitUntil(deleteOldCaches());
	self.clients.claim();
});

// Fetch strategy.
self.addEventListener('fetch', (event) => {
	// Skip non-GET requests and browser extensions.
	if (event.request.method !== 'GET') return;
	if (event.request.url.startsWith('chrome-extension://')) return;

	const url = new URL(event.request.url);

	// Same-origin assets: cache first, network fallback, cache update.
	if (url.origin === self.location.origin) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				const cached = await cache.match(event.request);
				if (cached) {
					// Refresh cache in background.
					fetch(event.request)
						.then((res) => { if (res.ok) cache.put(event.request, res.clone()); })
						.catch(() => {});
					return cached;
				}
				try {
					const res = await fetch(event.request);
					if (res.ok) cache.put(event.request, res.clone());
					return res;
				} catch {
					return new Response('Offline', { status: 503, statusText: 'Offline' });
				}
			})()
		);
		return;
	}

	// Cross-origin: network first, no cache (Google APIs, maps, etc.).
	event.respondWith(
		fetch(event.request).catch(() => caches.match(event.request))
	);
});

// Listen for skipWaiting messages from the page.
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
