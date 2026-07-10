/**
 * NOSTR checkpoint module.
 *
 * A checkpoint is a small NOSTR event that publishes the
 * current state of a single match to the public relays.
 * Other devices (or this same device after a refresh)
 * can read the most recent checkpoint for a match and
 * resume the game from there.
 *
 * The match id is the room name we use in yjsRoom, with
 * the `gin-darts-match-` prefix stripped so the event
 * tag stays short. We sign with the user's NOSTR key so
 * a future "trust list" can filter checkpoints by
 * admin/origin if we ever need that.
 *
 * Wire protocol on the relay side:
 *   - kind 30001 (custom app data)
 *   - tags: t = darts-checkpoint, e = matchId, d = matchId
 *   - content: JSON blob with the same fields we'd put
 *     in the y-webrtc room's Y.Map (so a reader without
 *     a Yjs room can still render the bracket)
 */
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { DEFAULT_RELAYS } from './calendar.js';

const KIND_CHECKPOINT = 30001;

/**
 * Strip the room-name prefix we use in yjsRoom so the
 * NOSTR tag stays portable. We tolerate either the bare
 * id or the prefixed form.
 */
export function matchIdFromRoomName(/** @type {string} */ roomName) {
	return String(roomName || '').replace(/^gin-darts-match-/, '');
}

export function roomNameFromMatchId(/** @type {string} */ matchId) {
	return `gin-darts-match-${matchId}`;
}

/**
 * Sign and publish a single checkpoint event. Returns
 * the event id so the caller can log it. The function
 * is fire-and-forget on the relay side — relays that
 * never answer simply don't get the event, the rest of
 * the relays will.
 */
export async function publishCheckpoint(/** @type {{
 * relays?: string[],
 * secretKey: string,
 * matchId: string,
 * snapshot: any
 * }} */ opts) {
	const skHex = String(opts?.secretKey || '');
	const matchId = matchIdFromRoomName(opts?.matchId);
	if (!skHex || !matchId) return null;
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	const sk = hexToBytes(skHex);
	const pk = getPublicKey(sk);
	const ts = Math.floor(Date.now() / 1000);
	const template = {
		kind: KIND_CHECKPOINT,
		created_at: ts,
		tags: [
			['t', 'darts-checkpoint'],
			['e', matchId],
			['d', matchId]
		],
		content: JSON.stringify({
			matchId,
			snapshot: opts?.snapshot || {},
			updatedAt: Date.now()
		}),
		pubkey: pk
	};
	const ev = finalizeEvent(template, sk);
	const pool = new SimplePool();
	try {
		await Promise.any(pool.publish(relays, ev));
	} catch {
		// No relay acknowledged; the event is still
		// in memory but lost on the network side. The
		// next commitTurn will try again.
	} finally {
		pool.close(relays);
	}
	return ev.id;
}

/**
 * Read the most recent checkpoint for a match from
 * any of the given relays. We treat the events as
 * "kind 30001 with t=darts-checkpoint and e=matchId"
 * and pick the one with the highest created_at.
 *
 * The underlying SimplePool from nostr-tools/pool
 * doesn't ship a synchronous query helper, so we use
 * the same subscribe-then-finish pattern as the
 * calendar module. That gives us a small bundle and
 * a uniform timeout story across the NOSTR code.
 */
export async function fetchLatestCheckpoint(/** @type {{
 * relays?: string[],
 * matchId: string,
 * pubkey?: string,
 * idleMs?: number,
 * timeoutMs?: number
 * }} */ opts) {
	const matchId = matchIdFromRoomName(opts?.matchId);
	if (!matchId) return null;
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	const idleMs = opts.idleMs ?? 1500;
	const timeoutMs = opts.timeoutMs ?? 6000;
	const pool = new SimplePool();
	const seen = new Map();
	const filter = {
		kinds: [KIND_CHECKPOINT],
		'#t': ['darts-checkpoint'],
		'#e': [matchId]
	};
	try {
		return await new Promise((resolve) => {
			const finish = () => {
				clearTimeout(idleTimer);
				clearTimeout(deadline);
				sub.close();
				if (seen.size === 0) {
					resolve(null);
					return;
				}
				const events = Array.from(seen.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
				try {
					resolve(JSON.parse(events[0].content));
				} catch {
					resolve(null);
				}
			};
			const idleTimer = setTimeout(finish, idleMs);
			const deadline = setTimeout(finish, timeoutMs);
			const sub = pool.subscribeMany(relays, [filter], {
				onevent: (/** @type {any} */ ev) => {
					if (seen.has(ev.id)) return;
					seen.set(ev.id, ev);
				},
				oneose: () => {
					clearTimeout(idleTimer);
					setTimeout(finish, 500);
				},
				onclose: () => { /* relay dropped, others can still answer */ }
			});
		});
	} finally {
		pool.close(relays);
	}
}

function hexToBytes(/** @type {string} */ hex) {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}
