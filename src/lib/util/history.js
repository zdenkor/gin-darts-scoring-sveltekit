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
	stats[type] = stats[type] || defaultStatsShape();
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
	// Per-game counters. We aggregate from the
	// `history` array that the engine keeps in memory —
	// that array is the source of truth for everything
	// we count here. We update the lifetime stats for
	// both players, so the league standings + history
	// view can show the numbers without re-walking the
	// whole IDB history.
	if (Array.isArray(state.players)) {
		for (const p of state.players) {
			if (!p?.name || !Array.isArray(p.history)) continue;
			aggregatePlayerStats(stats[type], p);
		}
	}
	try {
		// JSON round-trip strips Svelte 5 $state proxies so IDB's
		// structured clone doesn't trip on non-cloneable wrappers.
		await put(STATS_STORE, { id: STATS_KEY, data: JSON.parse(JSON.stringify(stats)) });
	} catch (e) {
		console.warn('recordGameResult failed', e);
	}
}

/**
 * Stats shape we aggregate per type. The numbers are
 * the same ones the legacy `CHANGELOG.md` lists:
 *   - oneEighties / oneSeventyOnes / oneSeventyPlus /
 *     oneFortyPlus / oneHundredPlus: turn-count buckets
 *   - highestCheckout: best checkout value seen
 *   - checkoutHundreds: count of checkouts >= 100
 *   - checkoutAttempts / checkoutsMade: ratio source
 *   - bestLegDarts: minimum darts used to win a leg
 *   - legsTo9/12/15/18/21: legs won with at most N darts
 *   - legsThrowingFirst / legsThrowingFirstWon: throw-first counts
 *   - legsWon / legsPlayed: w/l ratio source
 */
function defaultStatsShape() {
	return {
		played: 0,
		wins: {},
		best: {},
		oneEighties: {},
		oneSeventyOnes: {},
		oneSeventyPlus: {},
		oneFortyPlus: {},
		oneHundredPlus: {},
		highestCheckout: {},
		checkoutHundreds: {},
		checkoutAttempts: {},
		checkoutsMade: {},
		bestLegDarts: {},
		legsTo9: {},
		legsTo12: {},
		legsTo15: {},
		legsTo18: {},
		legsTo21: {},
		legsThrowingFirst: {},
		legsThrowingFirstWon: {},
		legsWon: {},
		legsPlayed: {},
		turns: {}
	};
}

function ensurePlayer(/** @type {any} */ bucket, /** @type {string} */ name) {
	for (const k of Object.keys(bucket)) {
		if (typeof bucket[k] === 'object' && bucket[k] !== null) {
			if (!(name in bucket[k])) bucket[k][name] = 0;
		}
	}
}

function aggregatePlayerStats(/** @type {any} */ typeStats, /** @type {any} */ player) {
	const name = player.name;
	if (!name) return;
	ensurePlayer(typeStats, name);
	for (const h of player.history) {
		const t = h?.total;
		if (typeof t !== 'number' || t <= 0) continue;
		typeStats.turns[name] = (typeStats.turns[name] || 0) + 1;
		if (h.is180) typeStats.oneEighties[name] += 1;
		if (h.is171) typeStats.oneSeventyOnes[name] += 1;
		else if (h.is170plus) typeStats.oneSeventyPlus[name] += 1;
		else if (h.is140plus) typeStats.oneFortyPlus[name] += 1;
		else if (h.is100plus) typeStats.oneHundredPlus[name] += 1;
		// Checkout tracking. isCheckout is true only on
		// the turn that won the leg, and the checkout
		// value is the score the player was on before
		// their last throw.
		if (h.isCheckout) {
			const cv = h.checkoutValue || 0;
			if (cv > (typeStats.highestCheckout[name] || 0)) typeStats.highestCheckout[name] = cv;
			if (cv >= 100) typeStats.checkoutHundreds[name] += 1;
			typeStats.checkoutsMade[name] = (typeStats.checkoutsMade[name] || 0) + 1;
			// Best leg in darts. We assume 3 darts per
			// turn unless the entry says otherwise.
			const darts = h.darts || 3;
			const prevBest = typeStats.bestLegDarts[name] || 99;
			if (darts < prevBest) typeStats.bestLegDarts[name] = darts;
			// Legs-to-N counters (the legacy dashboard
			// tracked 9 / 12 / 15 / 18 / 21 — the number
			// of darts it took to close the leg).
			if (darts <= 9) typeStats.legsTo9[name] += 1;
			else if (darts <= 12) typeStats.legsTo12[name] += 1;
			else if (darts <= 15) typeStats.legsTo15[name] += 1;
			else if (darts <= 18) typeStats.legsTo18[name] += 1;
			else typeStats.legsTo21[name] += 1;
			// Throwing-first tracking is computed at the
			// engine level (we'd need a snapshot of who
			// started the leg). The GameScreen fills
			// `h.legsToThrowFirstWin` when known — if
			// absent we simply skip the increment.
			if (h.legsThrowingFirst) typeStats.legsThrowingFirst[name] += 1;
			if (h.legsThrowingFirstWon) typeStats.legsThrowingFirstWon[name] += 1;
		}
		// Checkout attempts are recorded separately in
		// the per-leg question (see GameScreen). The
		// number lives on the history entry as
		// `checkoutAttempts` — we only aggregate when
		// the player said how many darts they aimed.
		if (typeof h.checkoutAttempts === 'number') {
			typeStats.checkoutAttempts[name] = (typeStats.checkoutAttempts[name] || 0) + h.checkoutAttempts;
		}
		typeStats.legsPlayed[name] = (typeStats.legsPlayed[name] || 0) + 1;
	}
	typeStats.legsWon[name] = (typeStats.legsWon[name] || 0) + (player.legsWon || 0);
}

export async function recordGameHistory(entry) {
	try {
		// JSON round-trip strips Svelte 5 $state proxies so IDB's
		// structured clone doesn't trip on non-cloneable wrappers.
		const id = entry.id || uuid();
		const plain = JSON.parse(JSON.stringify({
			id,
			...entry,
			recordedAt: Date.now()
		}));
		await put(STORE, plain);
		return id;
	} catch (e) {
		console.warn('recordGameHistory failed', e);
		return null;
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
