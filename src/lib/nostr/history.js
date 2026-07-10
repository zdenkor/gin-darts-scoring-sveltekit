/**
 * NOSTR player history module.
 *
 * Lets a player (or anyone, really) pull every tournament
 * they've ever competed in, as long as the tournament
 * admins published the results on a public NOSTR relay.
 *
 * Wire protocol on the relay side:
 *   - One event per finished tournament, kind 30001.
 *   - The `tags` array contains one `i` (identifier) tag
 *     per registered player, e.g. ["i", "SK123456"]. The
 *     filter is `#i: ["SK123456"]` to find events that
 *     mentioned this id.
 *   - The `content` field is a freeform JSON string with
 *     the admin's tournament summary, including a
 *     `data_url` pointing at the detailed bracket JSON
 *     on the admin's Google Drive.
 *
 * What we hand back to the UI:
 *   - a list of tournaments where the id appears
 *   - merged career stats (wins/losses, 3-dart average,
 *     180s, high checkout, clubs visited)
 */
import { SimplePool } from 'nostr-tools/pool';
import { fetchTournaments, DEFAULT_RELAYS } from './calendar.js';

/**
 * Pull every tournament event that mentions the given
 * license id. We reuse the calendar's fetchTournaments
 * with an extra `#i` tag filter — the calendar module
 * already knows how to talk to the relays and to
 * de-duplicate by event id, so we just feed it a
 * different filter and let it run.
 *
 * The lookback defaults to 1 year because the relays
 * don't store infinite history and most players won't
 * search for tournaments older than that. A future
 * refinement can ask the user for a custom range.
 */
export async function fetchPlayerHistory(/** @type {{
 * relays?: string[],
 * licenseId: string,
 * sinceDays?: number
 * }} */ opts) {
	const id = String(opts?.licenseId || '').trim();
	if (!id) return [];
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	const sinceDays = opts.sinceDays ?? 365;
	const since = Math.floor(Date.now() / 1000) - sinceDays * 24 * 60 * 60;
	const events = await fetchTournaments({
		relays,
		since,
		extra: { '#i': [id] }
	});
	return events;
}

/**
 * Same parser as the calendar uses, but exposed under
 * a more specific name so the history page reads
 * naturally. The data shape is the same.
 */
export function parseHistoryEvent(/** @type {any} */ ev) {
	return parseTournament(ev);
}

function parseTournament(/** @type {any} */ ev) {
	let payload = { name: '', date: '', location: '', format: '', data_url: '', players: /** @type {any[]} */ ([]) };
	if (typeof ev?.content === 'string' && ev.content.length > 0) {
		try {
			const parsed = JSON.parse(ev.content);
			payload = { ...payload, ...parsed };
		} catch {
			payload.name = ev.content.slice(0, 80);
		}
	}
	const tags = /** @type {string[][]} */ (ev?.tags || []);
	for (const t of tags) {
		if (t[0] === 'l' && !payload.location) payload.location = t[1];
		if (t[0] === 'd' && !payload.date) payload.date = t[1];
		if (t[0] === 'format' && !payload.format) payload.format = t[1];
	}
	return { ...payload, id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at };
}

/**
 * Pull the full bracket JSON for a tournament. We
 * follow the data_url the admin published. Some of
 * them point at Google Drive (drive.google.com/uc?id=...),
 * some at raw GitHub or a personal site. fetch() handles
 * CORS as well as it can; we don't try to be clever here.
 *
 * Returns the parsed JSON or null on failure.
 */
export async function fetchTournamentDetail(/** @type {string} */ dataUrl) {
	if (!dataUrl) return null;
	try {
		const res = await fetch(dataUrl, { mode: 'cors' });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

/**
 * Build a career-stats record for one player across
 * every tournament detail JSON we managed to fetch.
 *
 * The shape of a tournament detail JSON isn't fixed by
 * this protocol — each admin can publish whatever they
 * like. We therefore look at the obvious field names
 * (matches, legs, turns, threeDartAverage, checkoutMax,
 * oneEightyCount) and skip silently if they're missing.
 */
export function computePlayerStats(/** @type {any} */ licenseId, /** @type {any[]} */ tournamentDetails) {
	const id = String(licenseId || '').trim();
	const stats = {
		licenseId: id,
		tournaments: tournamentDetails.length,
		wins: 0,
		losses: 0,
		legsWon: 0,
		legsLost: 0,
		turnsPlayed: 0,
		threeDartTotal: 0,
		threeDartCount: 0,
		oneEighties: 0,
		highCheckout: 0,
		clubs: new Set(),
		formats: new Set()
	};
	for (const t of tournamentDetails) {
		if (!t) continue;
		// We tolerate either a { matches: [...] } or a
		// { results: [...] } summary.
		const matches = t.matches || t.games || [];
		for (const m of matches) {
			const players = [m.p1, m.p2].filter(Boolean);
			const isMe = players.some((/** @type {string} */ p) => p.includes(id) || id && p.toLowerCase().includes(id.toLowerCase()));
			if (!isMe) continue;
			stats.turnsPlayed += 1;
			if (m.winner) {
				if (m.winner === m.p1 || m.winner === m.p2) {
					if (m.winner.includes(id) || id && m.winner.toLowerCase().includes(id.toLowerCase())) {
						stats.wins += 1;
					} else {
						stats.losses += 1;
					}
				}
			}
			if (typeof m.threeDartAvg === 'number') {
				stats.threeDartTotal += m.threeDartAvg;
				stats.threeDartCount += 1;
			}
			if (Array.isArray(m.legs)) {
				for (const leg of m.legs) {
					stats.legsWon += leg.winner === m.p1 || leg.winner === m.p2 ? 1 : 0;
					stats.legsLost += leg.winner === m.p1 || leg.winner === m.p2 ? 1 : 0;
				}
			}
			if (typeof m.oneEighties === 'number') stats.oneEighties += m.oneEighties;
			if (typeof m.highCheckout === 'number' && m.highCheckout > stats.highCheckout) stats.highCheckout = m.highCheckout;
		}
		// Club names are best-effort — anything that
		// looks like a location string in the bracket.
		if (t.club) stats.clubs.add(t.club);
		if (t.location) stats.clubs.add(t.location);
		if (t.format) stats.formats.add(t.format);
	}
	return {
		...stats,
		clubs: Array.from(stats.clubs),
		formats: Array.from(stats.formats),
		threeDartAverage: stats.threeDartCount > 0 ? +(stats.threeDartTotal / stats.threeDartCount).toFixed(1) : null
	};
}
