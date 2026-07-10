/**
 * Debug settings — re-export the per-category on/off
 * toggles from localStorage so any module can ask
 * "is this category on?" without an explicit Settings
 * prop.
 *
 * The toggles are kept in localStorage under a single
 * key so the settings page can read and write them
 * with one round trip. Anything that wants to log
 * something can call isCategoryEnabled('nostr') before
 * doing the log; that keeps the IDB store from growing
 * when a category is off.
 */
import { LOG_CATEGORIES, LOG_CATEGORY_DEFAULTS } from './categories.js';

const STORAGE_KEY = 'gin-darts-debug-enabled';

function readAll() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...LOG_CATEGORY_DEFAULTS };
		const parsed = JSON.parse(raw);
		return { ...LOG_CATEGORY_DEFAULTS, ...parsed };
	} catch {
		return { ...LOG_CATEGORY_DEFAULTS };
	}
}

function writeAll(/** @type {Record<string, boolean>} */ obj) {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch { /* ignore */ }
}

export function isCategoryEnabled(/** @type {string} */ cat) {
	if (!LOG_CATEGORIES.includes(cat)) return false;
	const all = readAll();
	return !!all[cat];
}

export function setCategoryEnabled(/** @type {string} */ cat, /** @type {boolean} */ on) {
	if (!LOG_CATEGORIES.includes(cat)) return;
	const all = readAll();
	all[cat] = !!on;
	writeAll(all);
}

export function listEnabled() {
	return readAll();
}
