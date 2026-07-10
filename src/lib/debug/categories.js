/**
 * Debug log categories. Each category can be toggled
 * independently in Settings, and the View Logs modal
 * shows one tab per category. Adding a new category is
 * a matter of extending this list and the toggle group
 * in the Settings page.
 */
export const LOG_CATEGORIES = /** @type {const} */ (['nostr', 'webrtc', 'yjs', 'livesync']);

export const LOG_CATEGORY_LABELS = {
	nostr: 'NOSTR',
	webrtc: 'WebRTC',
	yjs: 'Yjs',
	livesync: 'Live sync'
};

/**
 * The per-category default. We keep NOSTR/WebRTC/Yjs on
 * by default so the first-time user sees something in
 * View Logs if anything fails. Live sync shares a
 * switch with Yjs so we leave the live-sync toggle
 * on by default too.
 */
export const LOG_CATEGORY_DEFAULTS = {
	nostr: true,
	webrtc: true,
	yjs: true,
	livesync: true
};

export function isCategory(/** @type {any} */ cat) {
	return LOG_CATEGORIES.includes(cat);
}
