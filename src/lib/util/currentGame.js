// =================================================================
// Persist the currently running game to IndexedDB so the user can
// close the tab and continue later.
// =================================================================

import { put, get, del } from '$lib/db/idb.js';
import { deepClone } from '$lib/util/deepClone.js';

const CURRENT_KEY = 'current';
const STORE = 'current-game';

export async function saveCurrentGame(gameState) {
	try {
		await put(STORE, { id: CURRENT_KEY, state: deepClone(gameState), savedAt: Date.now() }, CURRENT_KEY);
	} catch (e) {
		console.warn('saveCurrentGame failed', e);
	}
}

export async function hasCurrentGame() {
	try {
		const row = await get(STORE, CURRENT_KEY);
		return !!(row?.state && !row.state.endedAt && row.state.players?.length);
	} catch (e) {
		console.warn('hasCurrentGame failed', e);
		return false;
	}
}

export async function loadCurrentGame() {
	try {
		const row = await get(STORE, CURRENT_KEY);
		return row?.state || null;
	} catch (e) {
		console.warn('loadCurrentGame failed', e);
		return null;
	}
}

export async function clearCurrentGame() {
	try {
		await del(STORE, CURRENT_KEY);
	} catch (e) {
		console.warn('clearCurrentGame failed', e);
	}
}
