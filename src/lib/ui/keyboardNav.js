// =================================================================
// Global keyboard navigation for TV / D-Pad.
//
// On TV the user has no mouse, no touch. Movement is by arrow
// keys (or a remote's D-Pad: Up/Down/Left/Right + OK/Enter).
// Without explicit focus management the browser only moves focus
// inside whatever happens to handle a keydown — for our native
// <select> popups that already works (Bits UI handles arrow
// keys inside the open menu). What this module adds is the
// GLOBAL movement between focusable elements on the page when
// no popup is open: pressing Right moves to the next focusable
// element to the right, Left to the previous one, Up to the
// first element in the next row above, Down to the first in
// the next row below. Enter activates the focused element.
// =================================================================

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]'
].join(',');

function focusableIn(root) {
	return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
}

// Build a 2D grid of focusables by sorting them top-to-bottom then
// left-to-right, then bucketing rows by their top position.
function gridOf(els) {
	const sorted = els.slice().sort((a, b) => {
		const ra = a.getBoundingClientRect();
		const rb = b.getBoundingClientRect();
		return ra.top - rb.top || ra.left - rb.left;
	});
	const rows = [];
	let current = [];
	let currentTop = -Infinity;
	for (const el of sorted) {
		const top = el.getBoundingClientRect().top;
		// A new row starts when the element is more than half a
		// typical tap target below the previous row.
		if (top - currentTop > 24) {
			if (current.length) rows.push(current);
			current = [];
		}
		current.push(el);
		currentTop = top;
	}
	if (current.length) rows.push(current);
	return rows;
}

function indexAt(grid, el) {
	for (let r = 0; r < grid.length; r++) {
		const c = grid[r].indexOf(el);
		if (c !== -1) return { r, c };
	}
	return { r: 0, c: 0 };
}

function focusBy(grid, r, c) {
	if (!grid.length) return;
	const row = grid[Math.max(0, Math.min(grid.length - 1, r))];
	const el = row[Math.max(0, Math.min(row.length - 1, c))];
	if (el && typeof el.focus === 'function') {
		el.focus();
		// Scroll into view if the page is taller than the viewport
		// (TV layouts are 2160p tall but content can overflow).
		try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch { /* noop */ }
	}
}

// Detect the "next row" for vertical movement. We pick the
// element in the next row whose left edge is closest to the
// current element's left edge. This matches what a D-Pad user
// would expect when pressing Down.
function stepVertically(grid, from, dr) {
	const target = grid[from.r]?.[from.c];
	if (!target) return null;
	const targetLeft = target.getBoundingClientRect().left;
	const newR = from.r + dr;
	if (newR < 0 || newR >= grid.length) return null;
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i < grid[newR].length; i++) {
		const d = Math.abs(grid[newR][i].getBoundingClientRect().left - targetLeft);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return { r: newR, c: best };
}

export function installKeyboardNav(root = document.body) {
	function onKeyDown(e) {
		// Skip when an input/textarea/select is focused so the
		// user can still type inside fields.
		const ae = document.activeElement;
		const tag = ae && ae.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (ae && ae.isContentEditable) return;
		// Skip when a Bits UI popup is open — its own handler
		// owns arrow keys for moving between items.
		if (document.querySelector('[data-bits-floating-content]')) return;

		const grid = gridOf(focusableIn(root));
		if (!grid.length) return;
		const flat = grid.flat();
		const activeIndex = flat.indexOf(ae);
		const fromIdx = activeIndex !== -1 ? indexAt(grid, ae) : { r: 0, c: 0 };

		switch (e.key) {
			case 'ArrowRight': {
				e.preventDefault();
				const next = fromIdx.c + 1 < grid[fromIdx.r].length
					? { r: fromIdx.r, c: fromIdx.c + 1 }
					: { r: fromIdx.r, c: 0 };
				focusBy(grid, next.r, next.c);
				break;
			}
			case 'ArrowLeft': {
				e.preventDefault();
				const prev = fromIdx.c > 0
					? { r: fromIdx.r, c: fromIdx.c - 1 }
					: { r: fromIdx.r, c: grid[fromIdx.r].length - 1 };
				focusBy(grid, prev.r, prev.c);
				break;
			}
			case 'ArrowDown': {
				e.preventDefault();
				const step = stepVertically(grid, fromIdx, +1);
				if (step) focusBy(grid, step.r, step.c);
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const step = stepVertically(grid, fromIdx, -1);
				if (step) focusBy(grid, step.r, step.c);
				break;
			}
			default:
				break;
		}
	}

	root.addEventListener('keydown', onKeyDown);
	return () => root.removeEventListener('keydown', onKeyDown);
}
