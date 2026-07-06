// =================================================================
// Record finished games into history for stats.
// =================================================================

import { put, getAll, del } from '$lib/db/idb.js';

const STORE = 'history';

function uuid() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export async function recordGameHistory(entry) {
	try {
		await put(STORE, {
			id: entry.id || uuid(),
			...entry,
			recordedAt: Date.now()
		});
	} catch (e) {
		console.warn('recordGameHistory failed', e);
	}
}

export async function loadGameHistory() {
	try {
		const rows = await getAll(STORE);
		return rows.map(r => {
			const { recordedAt, ...entry } = r;
			return entry;
		}).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
	} catch (e) {
		console.warn('loadGameHistory failed', e);
		return [];
	}
}

export async function deleteGameHistory(id) {
	try {
		await del(STORE, id);
	} catch (e) {
		console.warn('deleteGameHistory failed', e);
	}
}

export async function clearGameHistory() {
	try {
		const { clear } = await import('$lib/db/idb.js');
		await clear(STORE);
	} catch (e) {
		console.warn('clearGameHistory failed', e);
	}
}

export function gameHistoryEntryFromState(state, opts = {}) {
	const players = state.players.map(p => p.name);
	const winner = state.winner != null ? players[state.winner] : null;
	// Build rawDarts log from player histories for stats engine
	const rawDarts = [];
	let legStart = 0;
	for (let legIdx = 0; legIdx < 100; legIdx++) {
		let any = false;
		for (let i = 0; i < players.length; i++) {
			const p = state.players[i];
			const entry = p.history?.[legIdx];
			if (!entry) continue;
			any = true;
			const isBust = String(entry.what).startsWith('BUST');
			const totalMatch = String(entry.what).match(/^(\d+)$/);
			const total = isBust ? 0 : (totalMatch ? Number(totalMatch[1]) : 0);
			rawDarts.push({
				by: p.name,
				total,
				darts: 3,
				bust: isBust,
				isLegWin: false,
				isCheckout: false,
				legIdx
			});
		}
		if (any) {
			legStart = (legStart + 1) % players.length;
			rawDarts.push({ endLeg: true, legStart });
		}
	}
	return {
		id: opts.id || uuid(),
		type: state.type || 'x01',
		players,
		winner,
		startedAt: state.startedAt || Date.now(),
		endedAt: state.endedAt || Date.now(),
		rawDarts,
		opts: state.opts,
		scope: opts.scope || { type: 'standalone' }
	};
}
