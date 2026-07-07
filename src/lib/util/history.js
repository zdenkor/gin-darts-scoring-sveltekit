// =================================================================
// Record finished games into history for stats.
// =================================================================

import { put, get, getAll, del } from '$lib/db/idb.js';

const STORE = 'history';
const STATS_STORE = 'game-stats';
const STATS_KEY = 'stats';

function uuid() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// =================================================================
// Stats — per-type lifetime record (wins, best, played).
// Mirrors the vanilla `recordGameResult` from legacy store.js.
// =================================================================

/** @typedef {{played: number, wins: Record<string, number>, best: Record<string, number>}} TypeStats */

/** @returns {Promise<Record<string, TypeStats>>} */
export async function loadStats() {
	try {
		const row = await get(STATS_STORE, STATS_KEY);
		return row?.data || {};
	} catch (e) {
		console.warn('loadStats failed', e);
		return {};
	}
}

/**
 * Update lifetime stats for one finished game and persist.
 * For x01: best = lowest remaining score (0 is best).
 * For cricket/shanghai: best = highest score.
 */
export async function recordGameResult(state) {
	if (!state || state.winner == null) return;
	const type = state.type || 'x01';
	const stats = await loadStats();
	stats[type] = stats[type] || { played: 0, wins: {}, best: {} };
	stats[type].played += 1;
	const winner = state.players[state.winner];
	if (!winner) return;
	const name = winner.name;
	stats[type].wins[name] = (stats[type].wins[name] || 0) + 1;
	const score = winner.score | 0;
	const prev = stats[type].best[name] || 0;
	const isBetter = type === 'x01'
		? (prev === 0 ? score === 0 : score < prev)
		: score > prev;
	if (isBetter) stats[type].best[name] = score;
	try {
		// JSON round-trip strips Svelte 5 $state proxies so IDB's
		// structured clone doesn't trip on non-cloneable wrappers.
		await put(STATS_STORE, { id: STATS_KEY, data: JSON.parse(JSON.stringify(stats)) });
	} catch (e) {
		console.warn('recordGameResult failed', e);
	}
}

export async function recordGameHistory(entry) {
	try {
		// JSON round-trip strips Svelte 5 $state proxies so IDB's
		// structured clone doesn't trip on non-cloneable wrappers.
		const plain = JSON.parse(JSON.stringify({
			id: entry.id || uuid(),
			...entry,
			recordedAt: Date.now()
		}));
		await put(STORE, plain);
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
	// Build rawDarts log from player histories for stats engine.
	// Engine stores { what, delta, scoreAfter }; we use delta for the
	// thrown total (more reliable than parsing `what` for checkout /
	// bull / triple formats) and detect busts from the `what` prefix.
	const rawDarts = [];
	let legStart = 0;
	for (let legIdx = 0; legIdx < 100; legIdx++) {
		let any = false;
		for (let i = 0; i < players.length; i++) {
			const p = state.players[i];
			const entry = p.history?.[legIdx];
			if (!entry) continue;
			any = true;
			const isBust = typeof entry.what === 'string' && entry.what.startsWith('BUST');
			const total = isBust ? 0 : Math.abs(entry.delta ?? 0);
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
