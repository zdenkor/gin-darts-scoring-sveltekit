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
import { finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { hexToBytes } from './util.js';
import { log } from '$lib/debug/logger.js';

const KIND_TOURNAMENT = 30001;
const PUBKEY_HEX = /^[0-9a-f]{64}$/i;
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
	// Default window: last 30 days. Using `now` as the
	// default would silently exclude any tournament that
	// the admin published earlier (relays still keep them,
	// but the NOSTR `since` filter drops them). Users can
	// still pass `opts.since` to widen the window further
	// (e.g. for a year view). 30 days matches what most
	// calendar UIs do and keeps the request cheap.
	const since = opts.since ?? Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30;
	const extra = opts.extra ?? {};
	const idleMs = opts.idleMs ?? 1500;
	const timeoutMs = opts.timeoutMs ?? 6000;

	const pool = new SimplePool();
	const filter = buildTournamentFilter(since, extra);
	const seen = new Map();
	await log('nostr', `fetchTournaments: start relays=[${relays.join(', ')}] since=${since} timeoutMs=${timeoutMs} filter=${JSON.stringify(filter)}`);

	try {
		return await new Promise((resolve) => {
			const finish = (/** @type {string} */ reason) => {
				clearTimeout(idleTimer);
				clearTimeout(deadline);
				sub.close();
				const list = Array.from(seen.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
				void log('nostr', `fetchTournaments: finish reason=${reason} count=${list.length}`);
				resolve(list);
			};
			// The "we're done" signal: the relay set has
			// gone quiet for idleMs, OR the hard deadline
			// fires first.
			let idleTimer = setTimeout(() => finish('idle'), idleMs);
			let deadline = setTimeout(() => finish('deadline'), timeoutMs);
			const sub = pool.subscribeMany(relays, filter, {
				onevent: (/** @type {any} */ ev) => {
					if (seen.has(ev.id)) return;
					seen.set(ev.id, ev);
					void log('nostr', `fetchTournaments: event id=${ev.id} kind=${ev.kind} created_at=${ev.created_at} tags=${JSON.stringify(ev.tags?.slice(0, 5) || [])}`);
				},
				oneose: () => {
					// End of stored events on every relay —
					// we still want the live tail, so we
					// only shorten the idle deadline, we
					// don't finish immediately.
					clearTimeout(idleTimer);
					void log('nostr', `fetchTournaments: EOSE received, shortening idle to 500ms`);
					idleTimer = setTimeout(() => finish('eose'), 500);
				},
				onclose: (/** @type {any} */ reason) => {
					// A relay went away; that's not fatal,
					// the others can still answer.
					void log('nostr', `fetchTournaments: relay closed reason=${JSON.stringify(reason)}`);
				}
			});
		});
	} catch (e) {
		await log('nostr', `fetchTournaments: threw — ${e?.message || e}`);
		throw e;
	} finally {
		// SimplePool is fine to leave open for follow-up
		// subscriptions, but the calendar view tears down
		// between visits, so closing is the polite
		// default. (In a future commit we can move the
		// pool up to a long-lived store.)
		pool.close(relays);
		await log('nostr', `fetchTournaments: done unique=${seen.size}`);
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
	let payload = { name: '', date: '', location: '', format: '', type: '', data_url: '' };
	if (typeof ev?.content === 'string' && ev.content.length > 0) {
		try {
			const parsed = JSON.parse(ev.content);
			payload = { ...payload, ...parsed };
		} catch (e) {
			// Older (pre-0.4.20) publishers sometimes
			// shipped the name as plain text instead of
			// a JSON object. We don't want to surface the
			// raw blob as the tournament name because it
			// can be misleading ("Untitled competition"
			// is the literal string this user saw, and
			// it's just the default noisiest placeholder).
			// Mark these explicitly as legacy records so
			// the user knows the data is stale, not real.
			payload.name = '';
			payload.legacy = true;
			void log('nostr', `parseTournamentEvent: JSON.parse failed for ev=${ev.id} — ${e?.message || e}; marking as legacy event`);
		}
	}
	// Tag-based overrides (the relay filter asks for
	// '#t' but the calendar view can also display the
	// other tags). `starts` is the NIP-52-style ISO
	// date stamp; `d` is the tournament id; `l` is
	// the location.
	const tags = /** @type {string[][]} */ (ev?.tags || []);
	let tournamentId = '';
	for (const t of tags) {
		if (t[0] === 'l' && !payload.location) payload.location = t[1];
		if (t[0] === 'starts' && !payload.date) payload.date = t[1];
		if (t[0] === 'd') tournamentId = t[1];
		if (t[0] === 'format' && !payload.format) payload.format = t[1];
	}
	return { ...payload, tournamentId, id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at, _rawTags: tags };
}

/**
 * Sign and publish a tournament announcement. The
 * wire format mirrors the read path so a future
 * `parseTournamentEvent` call can recover the same
 * fields:
 *   - tags: t = darts-tournament, l = location,
 *     starts = ISO YYYY-MM-DD, d = tournament id,
 *     format = format
 *   - content: JSON with at least { name, date, location,
 *     format, data_url }
 * The function is fire-and-forget; a relay that doesn't
 * answer simply doesn't get the event.
 */
export async function publishTournament(/** @type {{
 * relays?: string[],
 * secretKey: string,
 * tournament: { id: string, name: string, date?: string, location?: string, format?: string, type?: string, data_url?: string }
 * }} */ opts) {
	const skHex = String(opts?.secretKey || '');
	if (!PUBKEY_HEX.test(skHex)) {
		await log('nostr', `publishTournament: invalid secretKey (length=${skHex.length})`);
		return null;
	}
	const t = opts?.tournament || {};
	if (!t.id || !t.name) {
		await log('nostr', `publishTournament: missing id or name (id=${t.id || '<empty>'}, name=${t.name || '<empty>'})`);
		return null;
	}
	const sk = hexToBytes(skHex);
	const template = {
		kind: KIND_TOURNAMENT,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['t', 'darts-tournament'],
			['d', t.id],
			...(t.location ? [['l', t.location]] : []),
			...(t.date ? [['starts', t.date]] : []),
			...(t.format ? [['format', t.format]] : [])
		],
		content: JSON.stringify({
			name: t.name,
			date: t.date || '',
			location: t.location || '',
			format: t.format || '',
			// v0.4.26: ship `type` alongside `format` so the
			// calendar can distinguish a parent league from a
			// child round or a one-off tournament. Previously
			// the calendar only saw `format` (e.g. "round
			// robin") and could not tell a league from a
			// tournament at a glance.
			type: t.type || '',
			data_url: t.data_url || '',
			// Extra fields added so the calendar can
			// surface a quick summary (round list + rules
			// excerpt) without forcing the reader to
			// follow a link. `rules` is the Tiptap HTML
			// from the Setup tab; we keep it short to
			// stay under most NOSTR relay size limits
			// (16kB per event by default).
			rounds: Array.isArray(t.rounds) ? t.rounds.map((/** @type {any} */ r) => ({
				name: r.name || '',
				date: r.date || '',
				time: r.time || '',
				location: r.location || ''
			})) : [],
			rules: t.rules || ''
		}),
		pubkey: ''
	};
	const ev = finalizeEvent(template, sk);
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	await log('nostr', `publishTournament: id=${t.id} name="${t.name}" relays=[${relays.join(', ')}]`);
	const pool = new SimplePool();
	let successCount = 0;
	let failureCount = 0;
	// Publish to every relay in parallel and log each
	// one's outcome. We don't fail the overall call on
	// individual relay errors — one bad relay shouldn't
	// stop the event from reaching the others.
	const settled = await Promise.allSettled(pool.publish(relays, ev));
	for (let i = 0; i < settled.length; i++) {
		const r = settled[i];
		const relay = relays[i];
		if (r.status === 'fulfilled') {
			successCount += 1;
			await log('nostr', `publishTournament: relay ${relay} OK`);
		} else {
			failureCount += 1;
			await log('nostr', `publishTournament: relay ${relay} FAILED — ${r.reason?.message || r.reason || 'unknown'}`);
		}
	}
	await log('nostr', `publishTournament: done id=${t.id} ok=${successCount} fail=${failureCount} evId=${ev.id}`);

	return ev.id;
}

/**
 * Issue a NIP-09 deletion request against a tournament
 * announcement we previously published. NOSTR relays
 * that respect NIP-09 should drop the original event
 * from their store; relays that don't are free to
 * ignore the request (the spec is best-effort).
 *
 * For addressable / replaceable events like our
 * `kind: 30001` tournaments, NIP-09 says the deletion
 * reference MUST use the `a` tag in the form
 *   `<kind>:<author-pubkey>:<d-tag-identifier>`
 * so relays can match the right event to drop.
 *
 * The caller must own the secret key that signed the
 * original event — relays should reject a deletion
 * request from anyone but the author. We don't enforce
 * that here; we just hand the signed request to the
 * relays and let them decide.
 *
 * @param {{
 *   relays?: string[],
 *   secretKey: string,
 *   event: { id: string, kind: number, pubkey: string, tags: string[][] }
 * }} opts
 * @returns {Promise<boolean>} true if at least one relay
 *   accepted the deletion request.
 */
export async function deleteTournament(/** @type {any} */ opts) {
	const relays = (opts?.relays && opts.relays.length > 0) ? opts.relays : DEFAULT_RELAYS;
	const skHex = opts?.secretKey;
	const target = opts?.event;
	if (!skHex || !target?.id || !target?.pubkey) {
		await log('nostr', `deleteTournament: missing secretKey / event.id / event.pubkey`);
		return false;
	}
	// Build the `a`-tag reference. The d-identifier is
	// the value of the original event's `d` tag; for our
	// 30001 events that's the competition id.
	const dTag = (target.tags || []).find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] || '';
	if (!dTag) {
		await log('nostr', `deleteTournament: target event ${target.id} has no d tag; cannot build a-tag reference`);
		return false;
	}
	const aRef = `${target.kind || KIND_TOURNAMENT}:${target.pubkey}:${dTag}`;
	const sk = hexToBytes(skHex);
	const template = {
		kind: 5,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['a', aRef],
			// Some relays also accept the e-tag as a
			// belt-and-suspenders hint pointing at the
			// specific event id; cheap to include.
			['e', target.id]
		],
		content: 'deleted',
		pubkey: ''
	};
	const ev = finalizeEvent(template, sk);
	await log('nostr', `deleteTournament: aRef=${aRef} evId=${target.id} relays=[${relays.join(', ')}]`);
	const pool = new SimplePool();
	let successCount = 0;
	let failureCount = 0;
	const publishOne = async (/** @type {string} */ relay) => {
		try {
			await pool.publish([relay], ev);
			successCount += 1;
			await log('nostr', `deleteTournament: relay OK ${relay}`);
		} catch (e) {
			failureCount += 1;
			await log('nostr', `deleteTournament: relay FAILED ${relay} — ${e?.message || e}`);
		}
	};
	await Promise.allSettled(relays.map(publishOne));
	await log('nostr', `deleteTournament: done ok=${successCount} fail=${failureCount} evId=${ev.id}`);
	return successCount > 0;
}

export { DEFAULT_RELAYS };
