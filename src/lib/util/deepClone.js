// Robust deep clone that avoids DataCloneError on Svelte 5 state proxies.
export function deepClone(obj) {
	if (obj == null || typeof obj !== 'object') return obj;
	return JSON.parse(JSON.stringify(obj));
}
