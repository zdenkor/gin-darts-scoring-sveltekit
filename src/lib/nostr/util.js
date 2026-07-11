/**
 * NOSTR hex utilities shared across the calendar,
 * checkpoint, identity and history modules. Kept tiny
 * so any module can pull it in without pulling in
 * a heavier crypto dependency.
 */

const HEX_RE = /^[0-9a-f]{64}$/i;

/** Convert a 32-byte secret-key hex into a Uint8Array. */
export function hexToBytes(/** @type {string} */ hex) {
	if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
		throw new Error('Invalid hex (expected 64 lowercase hex chars)');
	}
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/** True when the string is a 32-byte hex (64 hex chars). */
export function isValidHexPriv(/** @type {string} */ hex) {
	return typeof hex === 'string' && HEX_RE.test(hex);
}
