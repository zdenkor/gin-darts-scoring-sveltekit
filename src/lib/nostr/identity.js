/**
 * NOSTR identity module.
 *
 * Every NOSTR participant needs an secp256k1 keypair:
 *   - secretKey (32 random bytes hex) — kept on the device.
 *   - publicKey (x-only, 32 bytes hex) — derived from secret,
 *     used as the user's `npub` identifier on the relays.
 *
 * Two ways to bootstrap a keypair:
 *   1. generateKeypair() — fresh random pair (used when the
 *      user wants a brand new Nostr identity, e.g. before
 *      they sign in with Google).
 *   2. deriveKeypairFromGoogleUser(googleId) — deterministic
 *      from the Google user id. The same Google account
 *      always derives the same NOSTR key, so the user can
 *      recover it across browsers and devices.
 *
 * We never store the keypair on a server. localStorage keeps
 * it on the device; if it gets cleared the user re-derives
 * the key from their Google login.
 */
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes, isValidHexPriv } from './util.js';

const STORAGE_KEY = 'gin-darts-nostr-identity';

function toHex(/** @type {Uint8Array} */ bytes) {
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a brand-new NOSTR keypair (random 32 bytes). */
export function generateKeypair() {
	const sk = generateSecretKey();
	const pk = getPublicKey(sk);
	return { secretKey: toHex(sk), publicKey: pk };
}

/**
 * Deterministically derive a NOSTR keypair from a Google
 * user id. Uses SHA-256 over a salted input to get 32 bytes
 * of entropy, then derives the public key the same way
 * `getPublicKey` would.
 *
 * The salt is fixed for this app so the same Google id
 * always lands on the same Nostr key. If the user clears
 * localStorage they can re-derive by signing in with the
 * same Google account.
 */
export async function deriveKeypairFromGoogleUser(/** @type {string} */ googleId) {
	const enc = new TextEncoder();
	const data = enc.encode('gin-darts:nostr:v1:' + googleId);
	const hash = await crypto.subtle.digest('SHA-256', data);
	const sk = new Uint8Array(hash);
	const pk = getPublicKey(sk);
	return { secretKey: toHex(sk), publicKey: pk };
}

/**
 * Persist a keypair to localStorage. We keep the secret
 * here because the app is a single-player PWA — there is
 * no server, so the device is the only place the secret
 * can live. In a future hardening pass the secret would
 * move to a WebCrypto-protected non-extractable key, but
 * for the v0.4.x series plain localStorage matches the
 * rest of the app's persistence model.
 */
export function storeKeypair(/** @type {{ secretKey: string, publicKey: string }} */ kp) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(kp));
	} catch {
		// localStorage can throw in private mode; fall back
		// to sessionStorage so the session still works.
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kp));
	}
}

/** Read the previously-stored keypair, or null. */
export function getStoredKeypair() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.secretKey === 'string' && typeof parsed?.publicKey === 'string') {
			return parsed;
		}
	} catch {
		// ignore
	}
	return null;
}

/** Forget the stored keypair (used by a future 'sign out'). */
export function clearStoredKeypair() {
	try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
	try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * UI helper — return a shortened display form of a public
 * key. The full hex key is 64 chars; we trim the middle
 * to a head…tail form so it always fits a single line.
 * Real npub (NIP-19 bech32) encoding lives in the main
 * nostr-tools entry — we deliberately keep this module on
 * the /pure subpath so the bundle stays small. When we
 * need full npub rendering for the calendar / publish
 * step, we can import the main module from a single
 * call-site without paying the cost in this file.
 */
export function shortNpub(/** @type {string} */ publicKeyHex, /** @type {number} */ head = 8, /** @type {number} */ tail = 6) {
	if (publicKeyHex.length <= head + tail + 1) return publicKeyHex;
	return `${publicKeyHex.slice(0, head)}…${publicKeyHex.slice(-tail)}`;
}

/** Re-export for backwards compatibility with callers
 *  that imported the old `fromHex` name. */
export { hexToBytes as fromHex, isValidHexPriv };
