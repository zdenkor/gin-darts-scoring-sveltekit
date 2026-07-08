// =================================================================
// UI help-icon settings (Svelte 5 port of vanilla js/ui/help.js).
//
// Tracks whether help icons (ⓘ) are shown across the app. Persisted
// in localStorage via the settings store. No Drive sync — the
// SvelteKit sync layer is separate (see lib/auth/sync.js) and a
// scope-creep-free minimal port is the goal here.
//
// Usage:
//   import { helpVisible, setHelpVisible, applyHelpVisibility } from '$lib/util/help.js';
//   <HelpIcon topic="..." body="..." />
// =================================================================

import { loadSetting, saveSetting } from './settings.js';
import { writable } from 'svelte/store';

const KEY = 'showHelp';

// Reactive store: components subscribe with $helpVisible. Initialized
// from localStorage on first import.
export const helpVisible = writable(loadSetting(KEY) !== false);

/** Persist the current value and update the store. */
export function setHelpVisible(/** @type {boolean} */ show) {
	const v = !!show;
	saveSetting(KEY, v);
	helpVisible.set(v);
	applyHelpVisibility();
}

/** Sync all .help-icon elements' display with the current store value. */
export function applyHelpVisibility() {
	if (typeof document === 'undefined') return;
	let show;
	const unsubscribe = helpVisible.subscribe(v => (show = v));
	unsubscribe();
	for (const icon of /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.help-icon')])) {
		icon.style.display = show ? 'inline-flex' : 'none';
	}
}
