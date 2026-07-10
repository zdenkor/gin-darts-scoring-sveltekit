/**
 * Debug logger.
 *
 * Persists log entries into a small IndexedDB store and
 * hands them back to the Settings → View Logs modal.
 * The store is separate from the game data so a
 * clear-logs request can wipe logs without touching
 * competitions, matches or history.
 *
 * Capacity is capped at MAX_ENTRIES per category so the
 * store doesn't grow without bound; the oldest entries
 * are dropped when the cap is hit.
 *
 * Uses the raw IndexedDB API directly (no idb-keyval
 * dependency) so the debug logger adds zero install
 * weight.
 */
import { isCategory } from './categories.js';

const DB_NAME = 'gin-darts-debug';
const STORE_NAME = 'gin-darts-debug-logs';
const DB_VERSION = 1;
const MAX_ENTRIES = 500;
const cache = /** @type {Record<string, any[]>} */ ({});

let dbPromise = /** @type {Promise<IDBDatabase> | null} */ (null);

function openDb() {
	if (dbPromise) return dbPromise;
	if (typeof indexedDB === 'undefined') {
		dbPromise = Promise.reject(new Error('IndexedDB unavailable'));
		return dbPromise;
	}
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || new Error('IDB open failed'));
	});
	return dbPromise;
}

async function readStore(/** @type {string} */ key) {
	try {
		const db = await openDb();
		return await new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const req = store.get(key);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => resolve(null);
		});
	} catch {
		return null;
	}
}

async function writeStore(/** @type {string} */ key, /** @type {any} */ value) {
	try {
		const db = await openDb();
		await new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).put(value, key);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => resolve(undefined);
		});
	} catch { /* ignore — best-effort */ }
}

async function deleteStore(/** @type {string} */ key) {
	try {
		const db = await openDb();
		await new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).delete(key);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => resolve(undefined);
		});
	} catch { /* ignore */ }
}

/**
 * Persist a single log entry. Silent on failure — the
 * app must keep working when IndexedDB is unavailable
 * (private mode, quota exceeded, etc.).
 */
export async function log(/** @type {string} */ category, /** @type {any} */ message) {
	if (!isCategory(category)) return;
	const entry = {
		ts: Date.now(),
		message: typeof message === 'string' ? message : safeStringify(message)
	};
	const list = (await readStore(category)) || [];
	list.push(entry);
	if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
	await writeStore(category, list);
	cache[category] = list;
}

/**
 * Reader. Returns newest entries first. The cache
 * avoids hitting IndexedDB on every Settings render.
 */
export async function getLogs(/** @type {string} */ category, /** @type {number} */ limit = 200) {
	if (!isCategory(category)) return [];
	if (cache[category]) return cache[category].slice(-limit).reverse();
	const list = (await readStore(category)) || [];
	cache[category] = list;
	return list.slice(-limit).reverse();
}

/**
 * Wipe the log of a single category, or all of them
 * when called without a category. We also clear the
 * in-memory cache so the next read goes back to IDB.
 */
export async function clearLogs(/** @type {string | null} */ category) {
	const targets = category && isCategory(category) ? [category] : ['nostr', 'webrtc', 'yjs', 'livesync'];
	for (const t of targets) {
		await deleteStore(t);
		delete cache[t];
	}
}

/** Drop the in-memory cache (e.g. after a Settings toggle). */
export function invalidateLogCache() {
	for (const k of Object.keys(cache)) delete cache[k];
}

function safeStringify(/** @type {any} */ v) {
	try {
		if (v instanceof Error) return `${v.name}: ${v.message}`;
		if (typeof v === 'object') return JSON.stringify(v);
		return String(v);
	} catch {
		return '[unserialisable]';
	}
}
