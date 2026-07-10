/**
 * Yjs + y-webrtc + y-indexeddb room helper.
 *
 * A "room" is a shared document that two or more devices
 * on the same page can edit in real time. We use it for
 * the live darts score so the admin's tablet and the
 * tablet at the dartboard see the same state, even if
 * neither has internet.
 *
 * The wiring is the standard one:
 *   - Yjs CRDT (Y.Doc + Y.Map) is the source of truth
 *     for the room's state.
 *   - y-indexeddb gives us offline persistence on each
 *     device — when the device comes back online the
 *     room reopens with the same content.
 *   - y-webrtc provides the live transport. It needs a
 *     "signaling server" to broker the initial handshake
 *     between two devices; we point it at the public
 *     y-webrtc signaling server (the same one the rest
 *     of the ecosystem uses). For our app the signaling
 *     server only sees the room name, not the score.
 *
 * The room is identified by a human-readable name. For
 * the darts use case we use the match id, e.g.
 * `match-${matchId}`. Both devices that load the same
 * match id will end up editing the same document.
 */
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';

/** Public y-webrtc signaling servers (free, community-run). */
const DEFAULT_SIGNALING = [
	'wss://signaling.yjs.dev',
	'wss://y-webrtc-signaling-eu.herokuapp.com',
	'wss://y-webrtc-signaling-us.herokuapp.com'
];

/**
 * Open (or create) a Yjs room and return the document,
 * the provider, and a convenience Y.Map for the match
 * state.
 *
 * Caller is responsible for tearing the room down with
 * `closeRoom()` when the user navigates away.
 */
export function openRoom(/** @type {{
 * roomName: string,
 * signaling?: string[]
 * }} */ opts) {
	const roomName = String(opts?.roomName || '').trim();
	if (!roomName) throw new Error('openRoom: roomName is required');
	const signaling = opts.signaling && opts.signaling.length > 0 ? opts.signaling : DEFAULT_SIGNALING;

	const doc = new Y.Doc();
	// Local persistence first so the device always has a
	// copy of the latest state in IndexedDB, even before
	// the WebRTC handshake completes.
	const persistence = new IndexeddbPersistence(roomName, doc);
	// Live transport. The provider auto-connects to the
	// signaling servers, advertises our presence, and
	// syncs with any peer that joins the same room.
	const provider = new WebrtcProvider(roomName, doc, { signaling });
	const state = doc.getMap('match');

	return { doc, provider, persistence, state };
}

/**
 * Tear a room down cleanly. Disconnect from the
 * signaling server, close the IndexedDB persistence,
 * and destroy the in-memory document. Safe to call on
 * an already-closed room.
 */
export function closeRoom(/** @type {{
 * provider: any,
 * persistence: any,
 * doc: any
 * }} */ r) {
	try { r?.provider?.destroy?.(); } catch { /* ignore */ }
	try { r?.persistence?.destroy?.(); } catch { /* ignore */ }
	try { r?.doc?.destroy?.(); } catch { /* ignore */ }
}

/**
 * Patch a Y.Map with a partial object. Uses a single
 * transaction so the remote peer sees one consistent
 * update rather than a stream of property writes.
 */
export function patchState(/** @type {any} */ state, /** @type {Record<string, any>} */ patch) {
	state.doc.transact(() => {
		for (const [k, v] of Object.entries(patch || {})) {
			state.set(k, v);
		}
	});
}

/**
 * Read the current state of a Y.Map as a plain object.
 * The Y.Map values are returned as-is — Yjs encodes
 * primitives, arrays, and nested Y types with their
 * own objects, so callers usually want to know which
 * fields are which.
 */
export function readState(/** @type {any} */ state) {
	const out = {};
	for (const [k, v] of state.entries()) out[k] = v;
	return out;
}

/**
 * Subscribe to state changes. Returns the unsubscribe
 * function.
 */
export function observeState(/** @type {any} */ state, /** @type {(ev: any) => void} */ cb) {
	const handler = (/** @type {any} */ ev) => cb(ev);
	state.observe(handler);
	return () => state.unobserve(handler);
}
