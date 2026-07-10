/**
 * NOSTR tournament calendar module.
 *
 * Reads tournament announcements published as NOSTR
 * `kind: 30001` events (custom app data) on public relays
 * and turns them into a flat list the UI can render.
 *
 * Wire protocol:
 *   - Each tournament is one event. The `content` field
 *     is a freeform JSON string with at least
 *     `{ name, date, location, format }` plus an optional
 *     `data_url` pointing to the detailed bracket JSON
 *     on the admin's Google Drive.
 *   - The event has a `t` tag of "darts-tournament" so
 *     we can filter darts-related events out of the
 *     general relay noise.
 *   - Optional `l` tags (location), `d` tag (date string),
 *     and `format` tag (501 DO, 301, etc.) for filtering
 *     before the relay returns the events.
 *
 * Public relays default to the free community relays that
 * the project has used in the past. We don't add a relay
 * picker to the UI in this commit; that's a follow-up.
 */
import { SimplePool } from 'nostr-tools/pool';

const DEFAULT_RELAYS = [
	'wss://relay.damus.io',
	'wss://nos.lol',
	'wss://relay.nostr.band'
];

/**
 * Build the NOSTR filter that asks for tournament events
 * newer than the cutoff date. We leave the upper bound
 * open (the relay can pick) so the user sees future
 * events as soon as they land.
 *
 * `extra` lets the caller add additional tag filters
 * (e.g. `{ '#l': ['Nitra'] }` for location).
 */
export function buildTournamentFilter(/** @type {number} */ since, /** @type {Record<string, any>} */ extra = {}) {
	return {
		kinds: [30001],
		'#t': ['darts-tournament'],
		since,
		...extra
	};
}

/**
 * Subscribe to the relays and collect events until either
 * the relay set has gone quiet for `idleMs` ms or the
 * `timeoutMs` overall deadline elapses. The returned list
 * is de-duplicated by event id and sorted newest-first.
 *
 * The function is intentionally tolerant: a relay that
 * never answers simply doesn't contribute events, the
 * call still resolves with what the others returned.
 */
export async function fetchTournaments(/** @type {{
 * relays?: string[],
 * since?: number,
 * extra?: Record<string, any>,
 * idleMs?: number,
 * timeoutMs?: number
 * }} */ opts = {}) {
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	const since = opts.since ?? Math.floor(Date.now() / 1000);
	const extra = opts.extra ?? {};
	const idleMs = opts.idleMs ?? 1500;
	const timeoutMs = opts.timeoutMs ?? 6000;

	const pool = new SimplePool();
	const filter = buildTournamentFilter(since, extra);
	const seen = new Map();

	try {
		return await new Promise((resolve) => {
			const finish = (/** @type {string} */ reason) => {
				clearTimeout(idleTimer);
				clearTimeout(deadline);
				sub.close();
				const list = Array.from(seen.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
				resolve(list);
				void reason;
			};
			// The "we're done" signal: the relay set has
			// gone quiet for idleMs, OR the hard deadline
			// fires first.
			let idleTimer = setTimeout(() => finish('idle'), idleMs);
			let deadline = setTimeout(() => finish('deadline'), timeoutMs);
			const sub = pool.subscribeMany(relays, [filter], {
				onevent: (/** @type {any} */ ev) => {
					if (seen.has(ev.id)) return;
					seen.set(ev.id, ev);
				},
				oneose: () => {
					// End of stored events on every relay —
					// we still want the live tail, so we
					// only shorten the idle deadline, we
					// don't finish immediately.
					clearTimeout(idleTimer);
					idleTimer = setTimeout(() => finish('eose'), 500);
				},
				onclose: () => {
					// A relay went away; that's not fatal,
					// the others can still answer.
				}
			});
		});
	} finally {
		// SimplePool is fine to leave open for follow-up
		// subscriptions, but the calendar view tears down
		// between visits, so closing is the polite
		// default. (In a future commit we can move the
		// pool up to a long-lived store.)
		pool.close(relays);
	}
}

/**
 * Parse the event's `content` blob into a tournament
 * record. The relay contract is JSON-in-content; if
 * the publisher forgot to send valid JSON we fall back
 * to a name-only record so the UI still has something
 * to show.
 */
export function parseTournamentEvent(/** @type {any} */ ev) {
	let payload = { name: '', date: '', location: '', format: '', data_url: '' };
	if (typeof ev?.content === 'string' && ev.content.length > 0) {
		try {
			const parsed = JSON.parse(ev.content);
			payload = { ...payload, ...parsed };
		} catch {
			// Treat the content as plain text name. Useful
			// for the early, hand-published events.
			payload.name = ev.content.slice(0, 80);
		}
	}
	// Tag-based overrides (the relay filter asks for
	// '#t' but the calendar view can also display the
	// other tags).
	const tags = /** @type {string[][]} */ (ev?.tags || []);
	for (const t of tags) {
		if (t[0] === 'l' && !payload.location) payload.location = t[1];
		if (t[0] === 'd' && !payload.date) payload.date = t[1];
		if (t[0] === 'format' && !payload.format) payload.format = t[1];
	}
	return { ...payload, id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at };
}

export { DEFAULT_RELAYS };
