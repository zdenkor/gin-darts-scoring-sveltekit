/**
 * Archive module — post-game final-state upload.
 *
 * When a match ends (game.winner != null && game.endedAt
 * is set) the admin's device uploads a final, immutable
 * JSON of the entire match to:
 *   1. Google Drive (if signed in — free, persistent,
 *      tied to the admin's account)
 *   2. IPFS via Pinata (free tier, public, world-readable
 *      once the admin pastes a Pinata JWT into Settings)
 *   3. A NOSTR event pointing at the data_url above so
 *      other players and the public calendar can find
 *      the archive later.
 *
 * Everything is best-effort. A failed upload doesn't
 * interrupt the game — the engine has already decided
 * the result. We just give other people a way to find
 * the result later.
 */
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { DEFAULT_RELAYS } from './nostr/calendar.js';
import { hexToBytes } from './nostr/util.js';

const KIND_ARCHIVE = 30001;
const IPFS_PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Build a stable archive blob for a match. The blob is
 * JSON-serialisable and includes the engine's game
 * state plus a few human-friendly headers (match id,
 * finished-at, players).
 */
export function buildArchiveBlob(/** @type {any} */ game) {
	if (!game) return null;
	return {
		matchId: game.id,
		finishedAt: game.endedAt || Date.now(),
		players: (game.players || []).map((/** @type {any} */ p) => ({
			name: p.name,
			isBot: !!p.isBot,
			botLevel: p.botLevel || null
		})),
		winner: game.winner ?? null,
		game: game
	};
}

/**
 * Upload a JSON blob to Google Drive. Returns the
 * public file id on success or null on failure. The
 * access token is the OAuth bearer from the signed-in
 * Google user; we use the multipart upload endpoint
 * so we can set the file metadata and the body in one
 * round trip.
 */
export async function uploadToDrive(/** @type {{
 * accessToken: string,
 * json: any,
 * filename?: string,
 * folderId?: string | null
 * }} */ opts) {
	const token = String(opts?.accessToken || '');
	if (!token) return null;
	const filename = opts.filename || `gin-darts-match-${opts?.json?.matchId || Date.now()}.json`;
	const metadata = {
		name: filename,
		mimeType: 'application/json',
		...(opts.folderId ? { parents: [opts.folderId] } : {})
	};
	const boundary = '----gin-darts-' + Math.random().toString(36).slice(2);
	const body =
		`--${boundary}\r\n` +
		`Content-Type: application/json; charset=UTF-8\r\n\r\n` +
		JSON.stringify(metadata) + `\r\n` +
		`--${boundary}\r\n` +
		`Content-Type: application/json\r\n\r\n` +
		JSON.stringify(opts.json) + `\r\n` +
		`--${boundary}--`;
	try {
		const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': `multipart/related; boundary=${boundary}`
			},
			body
		});
		if (!res.ok) return null;
		const out = await res.json();
		return out?.id || null;
	} catch {
		return null;
	}
}

/**
 * Upload a JSON blob to IPFS via Pinata's REST API.
 * Returns the IPFS CID on success or null on failure.
 * The Pinata JWT is stored in app settings by the user
 * (no client-side secret at rest).
 */
export async function uploadToIPFS(/** @type {{
 * pinataJwt: string,
 * json: any,
 * name?: string
 * }} */ opts) {
	const jwt = String(opts?.pinataJwt || '');
	if (!jwt) return null;
	const body = {
		pinataContent: opts.json,
		pinataMetadata: {
			name: opts.name || `gin-darts-match-${opts?.json?.matchId || Date.now()}`
		}
	};
	try {
		const res = await fetch(IPFS_PINATA_URL, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${jwt}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) return null;
		const out = await res.json();
		return out?.IpfsHash || null;
	} catch {
		return null;
	}
}

/**
 * Sign and publish a kind 30001 archive event pointing
 * at the data_url the caller already has (a Google
 * Drive URL, an IPFS gateway URL, or both). The
 * `t=darts-archive` tag lets the calendar and history
 * pages filter for finished tournaments.
 */
export async function publishArchiveEvent(/** @type {{
 * relays?: string[],
 * secretKey: string,
 * matchId: string,
 * dataUrl: string
 * }} */ opts) {
	const skHex = String(opts?.secretKey || '');
	const matchId = String(opts?.matchId || '');
	const dataUrl = String(opts?.dataUrl || '');
	if (!skHex || !matchId || !dataUrl) return null;
	const sk = hexToBytes(skHex);
	const pk = getPublicKey(sk);
	const template = {
		kind: KIND_ARCHIVE,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['t', 'darts-archive'],
			['e', matchId],
			['d', matchId],
			['r', dataUrl]
		],
		content: JSON.stringify({ matchId, data_url: dataUrl }),
		pubkey: pk
	};
	const ev = finalizeEvent(template, sk);
	const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS;
	const pool = new SimplePool();
	try {
		await Promise.any(pool.publish(relays, ev));
	} catch { /* see publishCheckpoint for the rationale */ } finally {
		pool.close(relays);
	}
	return ev.id;
}
