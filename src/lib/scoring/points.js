/**
 * League scoring — points table + bonus rules.
 *
 * Each league has a `scoring` shape:
 *   {
 *     pointsTable: [{ placement: '1.', points: [120, 150, 180, 210] }, ...],
 *     bonus: { max180: 2, highCheckout: 2, highCheckoutMin: 100 }
 *   }
 *
 * The points table mirrors the 1-8 / 9-16 / 17-32 / 33-60
 * brackets the user pasted in the spec; the bonus block
 * awards 2 points for a 180 (or 171 in some rules) and 2
 * points for any checkout of 100 or more.
 *
 * Both blocks are user-editable in the wizard, so we keep
 * them in a copy that's easy to mutate. The defaults are
 * the canonical starting point — `restoreDefaults()`
 * re-applies them in place.
 */
export const POINTS_TABLE_DEFAULT = /** @type {const} */ (Object.freeze([
	{ placement: '1.',         points: [120, 150, 180, 210] },
	{ placement: '2.',         points: [ 80, 110, 140, 170] },
	{ placement: '3. – 4.',    points: [ 40,  70, 100, 130] },
	{ placement: '5. – 6.',    points: [ 20,   0,   0,   0] },
	{ placement: '7. – 8.',    points: [ 10,   0,   0,   0] },
	{ placement: '5. – 8.',    points: [  0,  40,  70, 100] },
	{ placement: '9. – 12.',   points: [  0,  20,  40,  70] },
	{ placement: '13. – 16.',  points: [  0,  10,  40,  70] },
	{ placement: '17. – 24.',  points: [  0,   0,  20,  40] },
	{ placement: '25. – 32.',  points: [  0,   0,  10,  40] },
	{ placement: '33. – 48.',  points: [  0,   0,   0,  20] },
	{ placement: '49. – 64.',  points: [  0,   0,   0,  10] }
]));

export const BONUS_DEFAULT = Object.freeze({
	max180: 2,
	highCheckout: 2,
	highCheckoutMin: 100
});

export const BRACKET_SIZES = [
	{ label: '1–8',   min: 1,  max: 8,  idx: 0 },
	{ label: '9–16',  min: 9,  max: 16, idx: 1 },
	{ label: '17–32', min: 17, max: 32, idx: 2 },
	{ label: '33–60', min: 33, max: 60, idx: 3 }
];

/**
 * Return the bracket-size index (0-3) for a given
 * player count. Out-of-range values are clamped to
 * the nearest defined bracket.
 */
export function bracketSizeFor(/** @type {number} */ playerCount) {
	const n = Math.max(0, Math.floor(playerCount || 0));
	for (const b of BRACKET_SIZES) {
		if (n >= b.min && n <= b.max) return b.idx;
	}
	return n === 0 ? 0 : 3;
}

/**
 * Find the points for a given placement (1-indexed) in
 * the configured table. Walks the placement strings in
 * order and matches by range. The first matching range
 * wins; the bracket size selects the column. Returns 0
 * when the placement is past the table end (a player who
 * finished below 64th in a 60-player bracket gets zero).
 */
export function computePoints(/** @type {{
 * placement: number,
 * bracketSizeIdx?: number,
 * table?: any[],
 * bracketSize?: number
 * }} */ opts) {
	const placement = Math.max(1, Math.floor(opts?.placement || 1));
	const idx = opts.bracketSizeIdx ?? bracketSizeFor(opts.bracketSize || 0);
	const table = opts.table || POINTS_TABLE_DEFAULT;
	for (const row of table) {
		if (matchesPlacement(row.placement, placement)) {
			const cell = row.points?.[idx] ?? 0;
			return Number.isFinite(cell) ? cell : 0;
		}
	}
	return 0;
}

function matchesPlacement(/** @type {string} */ label, /** @type {number} */ placement) {
	// Accepts '1.', '3. – 4.', '49. – 64.' (en-dash with
	// optional spaces). Any number that's inside the
	// range counts as a match.
	const cleaned = String(label || '').replace(/[–—]/g, '-');
	const m = cleaned.match(/(\d+)\s*\.\s*-\s*(\d+)|(\d+)\s*\./);
	if (!m) return false;
	if (m[1] && m[2]) {
		const lo = Number(m[1]);
		const hi = Number(m[2]);
		return placement >= lo && placement <= hi;
	}
	return placement === Number(m[3]);
}

/**
 * Return a deep-clone of the default scoring shape so
 * the UI can mutate it freely.
 */
export function freshScoring() {
	return {
		pointsTable: POINTS_TABLE_DEFAULT.map((r) => ({ placement: r.placement, points: [...r.points] })),
		bonus: { ...BONUS_DEFAULT }
	};
}

/**
 * Re-apply the defaults in place. The competition
 * editor uses this for the "Restore defaults" button.
 */
export function restoreDefaults(/** @type {any} */ scoring) {
	if (!scoring || typeof scoring !== 'object') scoring = {};
	scoring.pointsTable = POINTS_TABLE_DEFAULT.map((r) => ({ placement: r.placement, points: [...r.points] }));
	scoring.bonus = { ...BONUS_DEFAULT };
	return scoring;
}
