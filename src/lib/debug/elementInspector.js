/**
 * Element inspector.
 *
 * A debug helper that, when enabled, watches mouseover /
 * mouseout events on the document and reports DOM details
 * about the element under the cursor. The Settings page
 * exposes a toggle ("Show element information") plus a
 * sub-form for which fields to show (tag, class, id, data
 * attributes, HTML) and how many parent / child levels to
 * walk up / down.
 *
 * The inspector is intentionally non-intrusive:
 *   - the highlight outline is set via a CSS class on the
 *     target, not by mutating inline styles, so a
 *     getComputedStyle() round trip isn't needed and the
 *     class can be toggled off by the dev tools.
 *   - the tooltip lives in a single fixed-position DOM
 *     node with `pointer-events: none` so the inspector
 *     never steals events from the page underneath.
 *   - the listeners are registered on the document (in
 *     capture phase) so they see every event, including
 *     the ones that would otherwise be stopped by
 *     Bits UI portals or modal backdrops.
 *
 * State lives in localStorage under a dedicated key so
 * the toggle survives reloads. Defaults are all OFF.
 */
const STORAGE_KEY = 'gin-darts-element-inspector';

const DEFAULTS = {
	enabled: false,
	display: 'tooltip', // 'tooltip' | 'sidebar'
	show: {
		tag: true,
		class: true,
		id: true,
		dataAttrs: true,
		html: false,
		parent1: false,
		parent2: false,
		child1: false,
		child2: false
	}
};

function readAll() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return structuredClone(DEFAULTS);
		const parsed = JSON.parse(raw);
		return {
			...structuredClone(DEFAULTS),
			...parsed,
			show: { ...DEFAULTS.show, ...(parsed.show || {}) }
		};
	} catch {
		return structuredClone(DEFAULTS);
	}
}

function writeAll(/** @type {any} */ obj) {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch { /* ignore */ }
}

export function getInspectorSettings() {
	return readAll();
}

export function setInspectorEnabled(/** @type {boolean} */ on) {
	const all = readAll();
	all.enabled = !!on;
	writeAll(all);
}

export function setInspectorShow(/** @type {Record<string, boolean>} */ show) {
	const all = readAll();
	all.show = { ...all.show, ...show };
	writeAll(all);
}

export function setInspectorDisplay(/** @type {'tooltip' | 'sidebar'} */ display) {
	if (display !== 'tooltip' && display !== 'sidebar') return;
	const all = readAll();
	all.display = display;
	writeAll(all);
}

/** Format a DOM element for the tooltip. Returns lines. */
function describeElement(/** @type {Element} */ el, /** @type {any} */ show) {
	const lines = [];
	if (show.tag) {
		lines.push(`<${el.tagName.toLowerCase()}>`);
	}
	if (show.class && el.className && typeof el.className === 'string') {
		lines.push(`.${el.className.trim().split(/\s+/).join(' .')}`);
	}
	if (show.id && el.id) {
		lines.push(`#${el.id}`);
	}
	if (show.dataAttrs) {
		for (const attr of el.attributes) {
			if (attr.name.startsWith('data-')) {
				lines.push(`${attr.name}="${attr.value}"`);
			}
		}
	}
	if (show.html) {
		const html = el.outerHTML;
		lines.push(html.length > 200 ? html.slice(0, 200) + '…' : html);
	}
	return lines;
}

let activeCleanup = null;

/** Walk N levels up. */
function parentAt(/** @type {Element | null} */ el, /** @type {number} */ n) {
	let cur = el;
	for (let i = 0; i < n; i++) {
		if (!cur) return null;
		cur = cur.parentElement;
	}
	return cur;
}

/** Walk N levels down — first child of first child of first child… */
function childAt(/** @type {Element | null} */ el, /** @type {number} */ n) {
	let cur = el;
	for (let i = 0; i < n; i++) {
		if (!cur) return null;
		cur = cur.firstElementChild;
	}
	return cur;
}

/**
 * Start the inspector. Idempotent: a second call
 * tears down the previous one before installing a
 * fresh listener pair. Pass a `host` Element to
 * install the tooltip inside (default: document.body).
 *
 * Two display modes:
 *   - 'tooltip' (default): a small floating box that
 *     follows the cursor.
 *   - 'sidebar': a fixed-width panel on the right
 *     edge of the viewport. The hovered element is
 *     scrolled into view if it isn't already, and
 *     the highlight is the same accent outline.
 *     Switching display mode is a re-start.
 */
export function startElementInspector(/** @type {{ host?: HTMLElement }} */ opts = {}) {
	stopElementInspector();
	const host = opts.host || (typeof document !== 'undefined' ? document.body : null);
	if (!host) return;

	const settings0 = readAll();
	const isSidebar = settings0.display === 'sidebar';

	const tip = document.createElement('div');
	tip.className = isSidebar ? 'element-inspector-sidebar' : 'element-inspector-tip';
	tip.style.cssText = isSidebar
		? [
			'position: fixed',
			'top: 0',
			'right: 0',
			'bottom: 0',
			'width: 320px',
			'z-index: 99999',
			'pointer-events: none',
			'padding: 12px',
			'border-left: 1px solid var(--line)',
			'background: rgba(11, 15, 23, 0.92)',
			'color: #e6ecf5',
			'font: 12px/1.4 ui-monospace, monospace',
			'white-space: pre-wrap',
			'word-break: break-all',
			'overflow-y: auto',
			'display: none'
		].join(';')
		: [
			'position: fixed',
			'top: 0',
			'left: 0',
			'z-index: 99999',
			'pointer-events: none',
			'max-width: 360px',
			'padding: 6px 8px',
			'border-radius: 6px',
			'background: rgba(0, 0, 0, 0.85)',
			'color: #e6ecf5',
			'font: 12px/1.4 ui-monospace, monospace',
			'white-space: pre-wrap',
			'word-break: break-all',
			'display: none'
		].join(';');
	host.appendChild(tip);

	let lastTarget = null;

	const refreshSettings = () => readAll();
	let settings = refreshSettings();

	const buildLines = (/** @type {Element} */ t) => {
		const lines = [];
		lines.push('--- element ---');
		lines.push(...describeElement(t, settings.show));
		if (settings.show.parent1) {
			const p1 = parentAt(t, 1);
			if (p1) {
				lines.push('--- parent L1 ---');
				lines.push(...describeElement(p1, settings.show));
			}
		}
		if (settings.show.parent2) {
			const p2 = parentAt(t, 2);
			if (p2) {
				lines.push('--- parent L2 ---');
				lines.push(...describeElement(p2, settings.show));
			}
		}
		if (settings.show.child1) {
			const c1 = childAt(t, 1);
			if (c1) {
				lines.push('--- child L1 ---');
				lines.push(...describeElement(c1, settings.show));
			}
		}
		if (settings.show.child2) {
			const c2 = childAt(t, 2);
			if (c2) {
				lines.push('--- child L2 ---');
				lines.push(...describeElement(c2, settings.show));
			}
		}
		return lines;
	};

	const showTip = (/** @type {Element} */ t, /** @type {MouseEvent|null} */ e) => {
		tip.textContent = buildLines(t).join('\n');
		tip.style.display = 'block';
		if (isSidebar) return;
		if (!e) return;
		const pad = 12;
		const x = Math.min(e.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
		const y = Math.min(e.clientY + pad, window.innerHeight - tip.offsetHeight - 8);
		tip.style.left = `${x}px`;
		tip.style.top = `${y}px`;
	};

	const hideTip = () => { tip.style.display = 'none'; };

	const onOver = (/** @type {MouseEvent} */ e) => {
		settings = refreshSettings();
		if (!settings.enabled) return;
		const t = e.target;
		if (!(t instanceof Element)) return;
		if (t === tip) return;
		if (lastTarget && lastTarget !== t) {
			lastTarget.classList.remove('element-inspector-highlight');
		}
		t.classList.add('element-inspector-highlight');
		lastTarget = t;
		// Sidebar mode: if the element is not in the
		// viewport, scroll the nearest scrollable
		// ancestor so the user can actually see it.
		if (settings.display === 'sidebar') {
			const rect = t.getBoundingClientRect();
			if (rect.top < 0 || rect.bottom > window.innerHeight) {
				try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
			}
		}
		showTip(t, e);
	};

	const onMove = (/** @type {MouseEvent} */ e) => {
		if (!settings.enabled || tip.style.display === 'none') return;
		if (settings.display === 'sidebar') return; // sidebar is fixed
		const pad = 12;
		const x = Math.min(e.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
		const y = Math.min(e.clientY + pad, window.innerHeight - tip.offsetHeight - 8);
		tip.style.left = `${x}px`;
		tip.style.top = `${y}px`;
	};

	const onOut = (/** @type {MouseEvent} */ e) => {
		const t = e.target;
		if (t instanceof Element && t.classList.contains('element-inspector-highlight')) {
			t.classList.remove('element-inspector-highlight');
		}
		lastTarget = null;
		// In sidebar mode, keep the last target's
		// info visible after the cursor leaves so the
		// user can scroll around without losing the
		// read-out. The next mouseover will refresh.
		if (settings.display === 'sidebar') return;
		hideTip();
	};

	document.addEventListener('mouseover', onOver, true);
	document.addEventListener('mousemove', onMove, true);
	document.addEventListener('mouseout', onOut, true);

	activeCleanup = () => {
		document.removeEventListener('mouseover', onOver, true);
		document.removeEventListener('mousemove', onMove, true);
		document.removeEventListener('mouseout', onOut, true);
		if (lastTarget) {
			lastTarget.classList.remove('element-inspector-highlight');
			lastTarget = null;
		}
		tip.remove();
	};
}

export function stopElementInspector() {
	if (activeCleanup) {
		activeCleanup();
		activeCleanup = null;
	}
}
